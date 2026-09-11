/**
 * What a coin is worth, as rules rather than as a balance.
 *
 * A claim is not a separate mechanism from a payout. It is a negative entry
 * in the same ledger, with the same idempotency guarantee, which means the
 * retry-safety story covers the whole economy rather than one endpoint. Every
 * rule that decides whether a claim may happen lives here, so the shelf a
 * tester sees and the debit the server performs cannot disagree about it.
 */

export type RewardKind =
  "CREDITS_MENTION" | "EARLY_ACCESS" | "ITEM_CODE" | "STEAM_KEY";

export type ClaimStatus = "REQUESTED" | "FULFILLED" | "CANCELLED";

/**
 * In ascending order of what it costs the studio, which is the order the
 * shelf is worth presenting in: the cheapest things to give away are the ones
 * a studio should stock first.
 */
export const REWARD_KINDS: readonly RewardKind[] = [
  "CREDITS_MENTION",
  "EARLY_ACCESS",
  "ITEM_CODE",
  "STEAM_KEY",
];

export const REWARD_KIND_LABEL: Record<RewardKind, string> = {
  CREDITS_MENTION: "Credits mention",
  EARLY_ACCESS: "Early access",
  ITEM_CODE: "In-game item code",
  STEAM_KEY: "Steam key",
};

/** What it costs the studio to hand one over — the studio's own framing. */
export const REWARD_KIND_COST_TO_STUDIO: Record<RewardKind, string> = {
  CREDITS_MENTION: "Nothing",
  EARLY_ACCESS: "Nothing",
  ITEM_CODE: "Near zero",
  STEAM_KEY: "One unit of inventory",
};

/**
 * The idempotency key for a claim, used for both the claim row and the ledger
 * entry that pays for it.
 *
 * Scoped to the user and the item rather than to the attempt, so the unique
 * constraint answers two questions at once: a double-clicked button debits
 * once, and a tester takes one of each item rather than the whole shelf. It
 * cannot collide with a verification key, which is scoped to an issue.
 */
export function claimKey(userId: string, rewardItemId: string): string {
  return `claim:${userId}:${rewardItemId}`;
}

/** The refund written when a studio cannot fulfil a claim it accepted. */
export function claimRefundKey(claimId: string): string {
  return `claim-refund:${claimId}`;
}

export interface RewardItemView {
  readonly id: string;
  readonly kind: RewardKind;
  readonly label: string;
  readonly costCoins: number;
  readonly totalStock: number;
  readonly claimedCount: number;
}

export function remainingStock(item: RewardItemView): number {
  return Math.max(0, item.totalStock - item.claimedCount);
}

export type ClaimRefusal =
  "insufficient_balance" | "out_of_stock" | "already_claimed";

export type ClaimVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: ClaimRefusal };

export const CLAIM_REFUSAL_MESSAGE: Record<ClaimRefusal, string> = {
  insufficient_balance:
    "You do not have enough coins for this yet. Verified issues are what earn them.",
  out_of_stock: "The studio has none of these left.",
  already_claimed: "You have already claimed this one.",
};

/**
 * Whether this tester may take this item right now.
 *
 * Order matters. "Already claimed" is checked first because it is the only
 * refusal that is not a problem — the tester has the thing — and telling them
 * they cannot afford something they already own would be nonsense. Stock
 * before balance, because a tester who cannot have it at any price should not
 * be told to go and earn more coins.
 */
export function canClaim(input: {
  readonly balance: number;
  readonly item: RewardItemView;
  readonly alreadyClaimed: boolean;
}): ClaimVerdict {
  if (input.alreadyClaimed) {
    return { allowed: false, reason: "already_claimed" };
  }
  if (remainingStock(input.item) <= 0) {
    return { allowed: false, reason: "out_of_stock" };
  }
  if (input.balance < input.item.costCoins) {
    return { allowed: false, reason: "insufficient_balance" };
  }
  return { allowed: true };
}

/**
 * The ledger amount a claim writes. Always negative, always the item's cost.
 *
 * A function rather than an inline minus sign so there is exactly one place
 * that decides the sign of a spend. A claim written positive would silently
 * pay a tester for taking a reward.
 */
export function claimDebitAmount(item: RewardItemView): number {
  return -Math.abs(item.costCoins);
}
