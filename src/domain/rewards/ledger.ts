/**
 * The reward ledger, as arithmetic (SPEC.md §6.4).
 *
 * Append-only. A balance is always the sum of the rows, never a column
 * somebody remembered to update -- a mutable balance is a second source of
 * truth, and the first time it disagrees with the ledger there is no way to
 * tell which one is lying.
 */

export type LedgerReason =
  "ISSUE_VERIFIED" | "FIRST_REPORTER_BONUS" | "MANUAL_ADJUSTMENT";

export interface LedgerEntry {
  readonly userId: string;
  readonly campaignId: string;
  readonly issueId: string | null;
  readonly amount: number;
  readonly reason: LedgerReason;
  readonly idempotencyKey: string;
}

/**
 * The idempotency key for verifying an issue.
 *
 * One key per issue, so a second verification of the same issue collides with
 * the first and pays nothing. The uniqueness of this string in the database
 * *is* the idempotency mechanism: insert it, and if the insert is rejected,
 * the payout already happened. Reading first and then inserting would leave a
 * window between the two where a concurrent request sees nothing and pays
 * again -- which is exactly the race a verify button double-clicked on a slow
 * connection produces.
 */
export function verificationKey(issueId: string): string {
  return `verify:${issueId}`;
}

/** Reasons that draw down the campaign's pool. Adjustments do not. */
const POOL_REASONS: ReadonlySet<LedgerReason> = new Set([
  "ISSUE_VERIFIED",
  "FIRST_REPORTER_BONUS",
]);

export function balanceOf(entries: readonly LedgerEntry[]): number {
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

export function poolSpent(entries: readonly LedgerEntry[]): number {
  return entries
    .filter((entry) => POOL_REASONS.has(entry.reason))
    .reduce((total, entry) => total + entry.amount, 0);
}

export class PoolExhaustedError extends Error {
  constructor(
    readonly campaignId: string,
    readonly requested: number,
    readonly remaining: number,
  ) {
    super(
      `This campaign's reward pool has ${remaining} coins left and the payout is ${requested}.`,
    );
    this.name = "PoolExhaustedError";
  }
}

/**
 * Whether a campaign can afford a payout.
 *
 * Checked inside the same transaction as the write, never before it. A pool
 * that is checked and then written to in two steps can be overspent by two
 * verifications landing together, and a studio that promised 5,000 coins
 * would owe 5,050.
 */
export function assertAffordable(input: {
  readonly campaignId: string;
  readonly poolTotal: number;
  readonly alreadySpent: number;
  readonly amount: number;
}): void {
  const remaining = input.poolTotal - input.alreadySpent;
  if (input.amount > remaining) {
    throw new PoolExhaustedError(input.campaignId, input.amount, remaining);
  }
}
