import { Prisma } from "@prisma/client";

import {
  PoolExhaustedError,
  assertAffordable,
  verificationKey,
} from "@/domain/rewards/ledger";
import {
  applySignalEvent,
  clampSignalScore,
  isRateLimited,
} from "@/domain/rewards/signalScore";
import { db } from "@/server/db";

/**
 * Paying the first reporter of a verified issue (SPEC.md §6.4).
 *
 * Two guarantees, both enforced by the database rather than by care:
 *
 * 1. Verifying twice pays once. The ledger's idempotencyKey is unique, so the
 *    second insert is rejected by the constraint. Reading first and inserting
 *    second would leave a window where two concurrent requests both see no
 *    row and both pay -- which is exactly what a verify button double-clicked
 *    on a slow connection produces.
 *
 * 2. The pool cannot be overdrawn. The campaign row is locked for the length
 *    of the transaction, so two different issues verified at the same instant
 *    cannot both read the same remaining balance and both spend it.
 */

export { PoolExhaustedError };

export interface RewardOutcome {
  readonly paid: boolean;
  readonly amount: number;
  readonly userId: string;
  readonly idempotencyKey: string;
}

/** Prisma's code for a unique constraint violation. */
const UNIQUE_VIOLATION = "P2002";

export async function payVerificationReward(
  issueId: string,
): Promise<RewardOutcome> {
  const issue = await db.issue.findUniqueOrThrow({
    where: { id: issueId },
    select: {
      id: true,
      campaignId: true,
      firstReporterId: true,
      campaign: { select: { rewardPerIssue: true } },
    },
  });

  const idempotencyKey = verificationKey(issue.id);
  const amount = issue.campaign.rewardPerIssue;

  try {
    await db.$transaction(async (tx) => {
      // Serialises pool spending for this campaign. Without it, two issues
      // verified in the same instant both read the same remaining balance and
      // a studio that promised 5,000 coins ends up owing 5,050.
      await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${issue.campaignId} FOR UPDATE`;

      const campaign = await tx.campaign.findUniqueOrThrow({
        where: { id: issue.campaignId },
        select: { rewardPoolTotal: true },
      });

      const spent = await tx.ledgerEntry.aggregate({
        where: {
          campaignId: issue.campaignId,
          reason: { in: ["ISSUE_VERIFIED", "FIRST_REPORTER_BONUS"] },
        },
        _sum: { amount: true },
      });

      assertAffordable({
        campaignId: issue.campaignId,
        poolTotal: campaign.rewardPoolTotal,
        alreadySpent: spent._sum.amount ?? 0,
        amount,
      });

      await tx.ledgerEntry.create({
        data: {
          userId: issue.firstReporterId,
          campaignId: issue.campaignId,
          issueId: issue.id,
          amount,
          reason: "ISSUE_VERIFIED",
          idempotencyKey,
        },
      });

      await awardSignalScore(tx, issue.id, issue.firstReporterId);
    });

    return {
      paid: true,
      amount,
      userId: issue.firstReporterId,
      idempotencyKey,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    ) {
      // Already paid. This is the mechanism working, not a failure: the
      // caller gets the same answer the first call got, minus the payment.
      return {
        paid: false,
        amount: 0,
        userId: issue.firstReporterId,
        idempotencyKey,
      };
    }
    throw error;
  }
}

/**
 * Standing moves with the verification: the finder gains most, everyone who
 * corroborated gains a little.
 */
async function awardSignalScore(
  tx: Prisma.TransactionClient,
  issueId: string,
  firstReporterId: string,
): Promise<void> {
  const corroborators = await tx.report.findMany({
    where: { issueId, isPossibleDuplicate: false, isNoise: false },
    select: { reporterId: true },
    distinct: ["reporterId"],
  });

  // The first reporter is credited from the issue itself, not from the join.
  // They are recorded on the issue precisely so this does not depend on their
  // report still being attached to it -- a report that gets split out later
  // must not retroactively erase the fact that they found the bug first.
  const awards = new Map<
    string,
    "verifiedUniqueIssue" | "attachedToVerified"
  >();
  awards.set(firstReporterId, "verifiedUniqueIssue");
  for (const { reporterId } of corroborators) {
    if (!awards.has(reporterId)) awards.set(reporterId, "attachedToVerified");
  }

  for (const [reporterId, event] of awards) {
    const user = await tx.user.findUnique({
      where: { id: reporterId },
      select: { signalScore: true },
    });
    if (user === null) continue;

    await tx.user.update({
      where: { id: reporterId },
      data: { signalScore: applySignalEvent(user.signalScore, event) },
    });
  }
}

/** A tester's balance is the sum of their ledger rows. Never a column. */
export async function balanceFor(userId: string): Promise<number> {
  const sum = await db.ledgerEntry.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return sum._sum.amount ?? 0;
}

/** Noise costs standing at the moment it is filed, not later (§6.4). */
export async function penaliseNoise(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { signalScore: true },
  });
  if (user === null) return;

  await db.user.update({
    where: { id: userId },
    data: { signalScore: applySignalEvent(user.signalScore, "noise") },
  });
}

export { clampSignalScore };

export interface TesterSummary {
  readonly balance: number;
  readonly signalScore: number;
  readonly rateLimited: boolean;
  readonly entries: readonly {
    readonly id: string;
    readonly amount: number;
    readonly reason: string;
    readonly issueTitle: string | null;
    readonly campaignTitle: string;
    readonly createdAt: Date;
  }[];
  readonly signatures: readonly {
    readonly campaignTitle: string;
    readonly typedName: string;
    readonly signedAt: Date;
    readonly ndaBodyHash: string;
  }[];
  readonly reportCount: number;
  readonly issuesFound: number;
}

/**
 * Everything a tester is owed and everything they have signed.
 *
 * The NDA record is here because a tester agreed to something and is entitled
 * to see exactly what, when, and under whose name (§6.3) -- an agreement they
 * cannot re-read is not one they can be held to.
 */
export async function getTesterSummary(userId: string): Promise<TesterSummary> {
  const [user, entries, signatures, reportCount, issuesFound] =
    await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { signalScore: true },
      }),
      db.ledgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.ndaSignature.findMany({
        where: { userId },
        orderBy: { signedAt: "desc" },
        include: { campaign: { select: { title: true } } },
      }),
      db.report.count({ where: { reporterId: userId } }),
      db.issue.count({
        where: { firstReporterId: userId, status: "VERIFIED" },
      }),
    ]);

  const campaignIds = [...new Set(entries.map((e) => e.campaignId))];
  const issueIds = entries
    .map((e) => e.issueId)
    .filter((id): id is string => id !== null);

  const [campaigns, issues] = await Promise.all([
    db.campaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, title: true },
    }),
    db.issue.findMany({
      where: { id: { in: issueIds } },
      select: { id: true, title: true },
    }),
  ]);

  const campaignTitle = new Map(campaigns.map((c) => [c.id, c.title]));
  const issueTitle = new Map(issues.map((i) => [i.id, i.title]));

  return {
    balance: await balanceFor(userId),
    signalScore: user.signalScore,
    rateLimited: isRateLimited(user.signalScore),
    entries: entries.map((entry) => ({
      id: entry.id,
      amount: entry.amount,
      reason: entry.reason,
      issueTitle:
        entry.issueId === null ? null : (issueTitle.get(entry.issueId) ?? null),
      campaignTitle: campaignTitle.get(entry.campaignId) ?? "A campaign",
      createdAt: entry.createdAt,
    })),
    signatures: signatures.map((signature) => ({
      campaignTitle: signature.campaign.title,
      typedName: signature.typedName,
      signedAt: signature.signedAt,
      ndaBodyHash: signature.ndaBodyHash,
    })),
    reportCount,
    issuesFound,
  };
}
