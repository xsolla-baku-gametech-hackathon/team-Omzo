import { Prisma } from "@prisma/client";

import {
  PoolExhaustedError,
  assertAffordable,
  verificationKey,
} from "@/domain/rewards/ledger";
import {
  applySignalEvent,
  clampSignalScore,
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
