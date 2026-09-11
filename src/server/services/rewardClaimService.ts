import { Prisma } from "@prisma/client";
import type { ClaimStatus, RewardKind } from "@prisma/client";

import {
  canClaim,
  claimDebitAmount,
  claimKey,
  claimRefundKey,
  remainingStock,
  type ClaimRefusal,
  type ClaimVerdict,
  type RewardItemView,
} from "@/domain/rewards/catalogue";
import { db } from "@/server/db";
import { getStudioCampaign } from "@/server/services/campaignService";

/**
 * Spending coins.
 *
 * A claim is a negative entry in the ledger that pays testers, not a parallel
 * mechanism — so the idempotency guarantee that covers a payout covers a
 * redemption too, and a balance stays the sum of its rows.
 *
 * Coins are spent **against the campaign that paid them**. Every ledger row
 * already carries a campaignId, so this is the balance that was always there;
 * the global sum is a convenience for the tester, not the thing a claim draws
 * on. Spending across campaigns would mean studio B handing out a Steam key
 * for work a tester did for studio A — B funded a pool and A's playtest spent
 * it. That is not a rounding error in the economy, it is the economy pointing
 * at the wrong studio.
 *
 * Two races have to be closed, and they are different races:
 *
 * 1. The same tester claiming the same item twice. Closed twice over: the
 *    user lock serialises the two attempts so the second reads the first's
 *    row, and if they somehow interleave anyway the unique idempotency key
 *    rejects the second insert. Either way the second attempt is a no-op that
 *    reports what already happened rather than an error — a double-clicked
 *    button is not a failure.
 *
 * 2. Two testers reaching for the last key, or one tester claiming two
 *    different items with only enough coins for one. The unique key cannot
 *    help with either, because the keys differ. Closed by row locks, taken in
 *    a fixed order — user, then item — so two concurrent claims can never
 *    hold one lock each and wait for the other.
 */

/** Prisma's code for a unique constraint violation. */
const UNIQUE_VIOLATION = "P2002";

export class ClaimRefusedError extends Error {
  constructor(readonly reason: ClaimRefusal) {
    super(`Claim refused: ${reason}`);
    this.name = "ClaimRefusedError";
  }
}

/**
 * Thrown when the item does not exist *or* the tester never joined that
 * campaign. Deliberately the same error for both: telling a stranger that an
 * item id is real confirms something they had no way to know.
 */
export class RewardItemNotFoundError extends Error {
  constructor() {
    super("No such reward.");
    this.name = "RewardItemNotFoundError";
  }
}

export interface ClaimOutcome {
  readonly claimed: boolean;
  readonly claimId: string;
  readonly spent: number;
  readonly balanceAfter: number;
}

function viewOf(item: {
  id: string;
  kind: RewardKind;
  label: string;
  costCoins: number;
  totalStock: number;
  claimedCount: number;
}): RewardItemView {
  return {
    id: item.id,
    kind: item.kind,
    label: item.label,
    costCoins: item.costCoins,
    totalStock: item.totalStock,
    claimedCount: item.claimedCount,
  };
}

/**
 * Takes one item for one tester, debiting the ledger in the same transaction.
 *
 * Participation is required: coins are earned across campaigns but a shelf
 * belongs to one studio, and a tester who never signed that campaign's NDA
 * has no business taking its keys.
 */
export async function claimReward(input: {
  readonly userId: string;
  readonly rewardItemId: string;
}): Promise<ClaimOutcome> {
  const idempotencyKey = claimKey(input.userId, input.rewardItemId);

  try {
    return await db.$transaction(async (tx) => {
      // Order matters and is fixed: user first, then item. Two claims that
      // took these in opposite orders would deadlock on each other.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "RewardItem" WHERE id = ${input.rewardItemId} FOR UPDATE`;

      const item = await tx.rewardItem.findUnique({
        where: { id: input.rewardItemId },
      });
      if (item === null) throw new RewardItemNotFoundError();

      const [signed, earned, balanceRow, existing] = await Promise.all([
        tx.ndaSignature.findUnique({
          where: {
            userId_campaignId: {
              userId: input.userId,
              campaignId: item.campaignId,
            },
          },
          select: { id: true },
        }),
        tx.ledgerEntry.findFirst({
          where: { userId: input.userId, campaignId: item.campaignId },
          select: { id: true },
        }),
        tx.ledgerEntry.aggregate({
          // Scoped to the campaign that owns this shelf, not the tester's
          // whole balance.
          where: { userId: input.userId, campaignId: item.campaignId },
          _sum: { amount: true },
        }),
        tx.rewardClaim.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        }),
      ]);

      // Either record counts as having been part of this campaign: a tester
      // who signed and has not earned yet belongs here, and so does one whose
      // signature predates a schema that did not record it.
      if (signed === null && earned === null) {
        throw new RewardItemNotFoundError();
      }

      const balance = balanceRow._sum.amount ?? 0;

      if (existing !== null) {
        // Not an error. The tester asked for something they already have —
        // a double-clicked button, or a reload — and the honest answer is
        // that nothing happened, not a failure. Same shape as a second
        // verification of an already-paid issue.
        return {
          claimed: false,
          claimId: existing.id,
          spent: 0,
          balanceAfter: balance,
        };
      }

      const verdict: ClaimVerdict = canClaim({
        balance,
        item: viewOf(item),
        alreadyClaimed: false,
      });
      if (!verdict.allowed) throw new ClaimRefusedError(verdict.reason);

      const amount = claimDebitAmount(viewOf(item));

      const claim = await tx.rewardClaim.create({
        data: {
          userId: input.userId,
          rewardItemId: item.id,
          idempotencyKey,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          userId: input.userId,
          campaignId: item.campaignId,
          issueId: null,
          amount,
          reason: "REWARD_CLAIMED",
          idempotencyKey,
        },
      });

      // Under the item lock, so the last key cannot be handed out twice.
      await tx.rewardItem.update({
        where: { id: item.id },
        data: { claimedCount: { increment: 1 } },
      });

      return {
        claimed: true,
        claimId: claim.id,
        spent: Math.abs(amount),
        balanceAfter: balance + amount,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    ) {
      // The constraint did its job: this claim already exists. The caller gets
      // the first call's answer, minus the debit.
      const claim = await db.rewardClaim.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      const item = await db.rewardItem.findUnique({
        where: { id: input.rewardItemId },
        select: { campaignId: true },
      });
      const balance = await db.ledgerEntry.aggregate({
        where: { userId: input.userId, campaignId: item?.campaignId },
        _sum: { amount: true },
      });
      return {
        claimed: false,
        claimId: claim?.id ?? "",
        spent: 0,
        balanceAfter: balance._sum.amount ?? 0,
      };
    }
    throw error;
  }
}

export interface ShelfEntry extends RewardItemView {
  readonly campaignId: string;
  readonly campaignTitle: string;
  /** What this tester has left with *this* campaign, which is what pays. */
  readonly campaignBalance: number;
  readonly remaining: number;
  readonly verdict: ClaimVerdict;
  readonly claim: {
    readonly id: string;
    readonly status: ClaimStatus;
    readonly code: string | null;
    readonly createdAt: Date;
  } | null;
}

/**
 * What this tester can reach, campaign by campaign.
 *
 * Each row's verdict is computed from the balance that will actually pay for
 * it — the campaign's, not the tester's total. A shelf that offers a "Claim"
 * button the server then refuses is worse than one that says why up front,
 * and 900 coins spread across three campaigns buys nothing priced at 800.
 */
export async function getShelfFor(userId: string): Promise<{
  readonly balance: number;
  readonly entries: readonly ShelfEntry[];
}> {
  const [signatures, byCampaign] = await Promise.all([
    db.ndaSignature.findMany({
      where: { userId },
      select: { campaignId: true },
    }),
    db.ledgerEntry.groupBy({
      by: ["campaignId"],
      where: { userId },
      _sum: { amount: true },
    }),
  ]);

  const campaignBalance = new Map(
    byCampaign.map((row) => [row.campaignId, row._sum.amount ?? 0]),
  );
  const balance = [...campaignBalance.values()].reduce(
    (total, amount) => total + amount,
    0,
  );

  // Signed up, or earned something here. Either counts as having been part
  // of the campaign.
  const campaignIds = [
    ...new Set([
      ...signatures.map((signature) => signature.campaignId),
      ...campaignBalance.keys(),
    ]),
  ];
  if (campaignIds.length === 0) return { balance, entries: [] };

  const [items, claims] = await Promise.all([
    db.rewardItem.findMany({
      where: { campaignId: { in: campaignIds } },
      orderBy: [{ costCoins: "asc" }, { createdAt: "asc" }],
      include: { campaign: { select: { title: true } } },
    }),
    db.rewardClaim.findMany({ where: { userId } }),
  ]);

  const byItem = new Map(claims.map((claim) => [claim.rewardItemId, claim]));

  return {
    balance,
    entries: items.map((item) => {
      const claim = byItem.get(item.id) ?? null;
      const view = viewOf(item);
      const available = campaignBalance.get(item.campaignId) ?? 0;
      return {
        ...view,
        campaignId: item.campaignId,
        campaignTitle: item.campaign.title,
        campaignBalance: available,
        remaining: remainingStock(view),
        verdict: canClaim({
          balance: available,
          item: view,
          alreadyClaimed: claim !== null,
        }),
        claim:
          claim === null
            ? null
            : {
                id: claim.id,
                status: claim.status,
                code: claim.fulfilledCode,
                createdAt: claim.createdAt,
              },
      };
    }),
  };
}

// ── Studio side ──────────────────────────────────────────────────────

export async function createRewardItem(input: {
  readonly campaignId: string;
  readonly studioId: string;
  readonly kind: RewardKind;
  readonly label: string;
  readonly costCoins: number;
  readonly totalStock: number;
}): Promise<{ readonly id: string }> {
  // Throws when the campaign belongs to another studio.
  await getStudioCampaign(input.campaignId, input.studioId);

  const item = await db.rewardItem.create({
    data: {
      campaignId: input.campaignId,
      kind: input.kind,
      label: input.label,
      costCoins: input.costCoins,
      totalStock: input.totalStock,
    },
    select: { id: true },
  });
  return item;
}

export interface StudioClaimRow {
  readonly id: string;
  readonly status: ClaimStatus;
  readonly code: string | null;
  readonly createdAt: Date;
  readonly testerName: string;
  readonly itemLabel: string;
  readonly itemKind: RewardKind;
  readonly costCoins: number;
}

export async function getRewardShelf(
  campaignId: string,
  studioId: string,
): Promise<{
  readonly items: readonly (RewardItemView & { readonly remaining: number })[];
  readonly claims: readonly StudioClaimRow[];
}> {
  await getStudioCampaign(campaignId, studioId);

  const items = await db.rewardItem.findMany({
    where: { campaignId },
    orderBy: [{ costCoins: "asc" }, { createdAt: "asc" }],
  });

  const claims = await db.rewardClaim.findMany({
    where: { rewardItem: { campaignId } },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { displayName: true } },
      rewardItem: { select: { label: true, kind: true, costCoins: true } },
    },
  });

  return {
    items: items.map((item) => ({
      ...viewOf(item),
      remaining: remainingStock(viewOf(item)),
    })),
    claims: claims.map((claim) => ({
      id: claim.id,
      status: claim.status,
      code: claim.fulfilledCode,
      createdAt: claim.createdAt,
      testerName: claim.user.displayName,
      itemLabel: claim.rewardItem.label,
      itemKind: claim.rewardItem.kind,
      costCoins: claim.rewardItem.costCoins,
    })),
  };
}

export class ClaimNotOpenError extends Error {
  constructor() {
    super("This claim has already been resolved.");
    this.name = "ClaimNotOpenError";
  }
}

export class ClaimNotFoundError extends Error {
  constructor() {
    super("No such claim.");
    this.name = "ClaimNotFoundError";
  }
}

async function loadOpenClaim(claimId: string, studioId: string) {
  const claim = await db.rewardClaim.findUnique({
    where: { id: claimId },
    include: { rewardItem: { select: { campaignId: true } } },
  });
  if (claim === null) throw new ClaimNotFoundError();

  // Tenancy: a claim is reachable only through the campaign that owns the
  // shelf it came from.
  await getStudioCampaign(claim.rewardItem.campaignId, studioId);

  if (claim.status !== "REQUESTED") throw new ClaimNotOpenError();
  return claim;
}

/** The studio pastes a code. We never generate one. */
export async function fulfilClaim(input: {
  readonly claimId: string;
  readonly studioId: string;
  readonly code: string;
}): Promise<void> {
  await loadOpenClaim(input.claimId, input.studioId);

  await db.rewardClaim.update({
    where: { id: input.claimId },
    // Guarded on status as well as id: two studio members fulfilling the same
    // claim at once must not overwrite each other's code.
    data: {
      status: "FULFILLED",
      fulfilledCode: input.code,
      resolvedAt: new Date(),
    },
  });
}

/**
 * The studio cannot supply this one. The tester gets their coins back and the
 * unit returns to stock.
 *
 * The claim row stays, so the tester cannot re-claim the item the studio just
 * said it could not supply. They have their balance back and the rest of the
 * shelf is open to them, which is the outcome that makes sense.
 */
export async function cancelClaim(input: {
  readonly claimId: string;
  readonly studioId: string;
}): Promise<void> {
  const claim = await loadOpenClaim(input.claimId, input.studioId);

  await db.$transaction(async (tx) => {
    const item = await tx.rewardItem.findUniqueOrThrow({
      where: { id: claim.rewardItemId },
    });

    await tx.ledgerEntry.create({
      data: {
        userId: claim.userId,
        campaignId: item.campaignId,
        issueId: null,
        amount: Math.abs(item.costCoins),
        reason: "CLAIM_REFUNDED",
        // Keyed on the claim, so a double-clicked cancel refunds once.
        idempotencyKey: claimRefundKey(claim.id),
      },
    });

    await tx.rewardClaim.update({
      where: { id: claim.id },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });

    await tx.rewardItem.update({
      where: { id: item.id },
      data: { claimedCount: { decrement: 1 } },
    });
  });
}
