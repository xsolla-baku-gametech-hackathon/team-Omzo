import { describe, expect, it } from "vitest";

import {
  PoolExhaustedError,
  assertAffordable,
  balanceOf,
  poolSpent,
  verificationKey,
} from "@/domain/rewards/ledger";
import type { LedgerEntry } from "@/domain/rewards/ledger";
import {
  RATE_LIMIT_BELOW_SCORE,
  SIGNAL_DELTAS,
  SIGNAL_SCORE_MAX,
  SIGNAL_SCORE_MIN,
  applySignalEvent,
  applySignalEvents,
  hourlyReportAllowance,
  isRateLimited,
} from "@/domain/rewards/signalScore";

const entry = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
  userId: "tester-01",
  campaignId: "campaign-1",
  issueId: "issue_1",
  amount: 50,
  reason: "ISSUE_VERIFIED",
  idempotencyKey: "verify:issue_1",
  ...overrides,
});

describe("verificationKey", () => {
  it("is one key per issue, so a second verification collides", () => {
    expect(verificationKey("issue_1")).toBe(verificationKey("issue_1"));
    expect(verificationKey("issue_1")).not.toBe(verificationKey("issue_2"));
  });
});

describe("balanceOf", () => {
  it("is the sum of the rows and nothing else", () => {
    expect(
      balanceOf([
        entry({ amount: 50 }),
        entry({ amount: 50, idempotencyKey: "verify:issue_2" }),
        entry({ amount: -20, reason: "MANUAL_ADJUSTMENT" }),
      ]),
    ).toBe(80);
  });

  it("is zero for a tester who has earned nothing", () => {
    expect(balanceOf([])).toBe(0);
  });
});

describe("poolSpent", () => {
  it("counts payouts but not manual adjustments", () => {
    // An adjustment is the studio correcting the record, not spending from
    // the pool they funded.
    expect(
      poolSpent([
        entry({ amount: 50, reason: "ISSUE_VERIFIED" }),
        entry({ amount: 25, reason: "FIRST_REPORTER_BONUS" }),
        entry({ amount: 500, reason: "MANUAL_ADJUSTMENT" }),
      ]),
    ).toBe(75);
  });
});

describe("assertAffordable", () => {
  const pool = { campaignId: "campaign-1", poolTotal: 100 };

  it("allows a payout the pool can cover", () => {
    expect(() =>
      assertAffordable({ ...pool, alreadySpent: 50, amount: 50 }),
    ).not.toThrow();
  });

  it("refuses to overdraw the pool", () => {
    expect(() =>
      assertAffordable({ ...pool, alreadySpent: 80, amount: 50 }),
    ).toThrow(PoolExhaustedError);
  });

  it("says what is left, so the studio knows what to top up", () => {
    try {
      assertAffordable({ ...pool, alreadySpent: 80, amount: 50 });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PoolExhaustedError);
      expect((error as PoolExhaustedError).remaining).toBe(20);
      expect((error as PoolExhaustedError).requested).toBe(50);
    }
  });

  it("refuses the payout that would take the pool to exactly zero plus one", () => {
    expect(() =>
      assertAffordable({ ...pool, alreadySpent: 100, amount: 1 }),
    ).toThrow(PoolExhaustedError);
  });
});

describe("signal score", () => {
  it("rewards a new find above an addition to a known one", () => {
    expect(SIGNAL_DELTAS.verifiedUniqueIssue).toBeGreaterThan(
      SIGNAL_DELTAS.attachedToVerified,
    );
  });

  it("costs more for noise than for a duplicate", () => {
    // A duplicate is a tester being unlucky. Noise wastes a human's attention.
    expect(SIGNAL_DELTAS.noise).toBeLessThan(SIGNAL_DELTAS.bulkDuplicate);
  });

  it("clamps at both ends", () => {
    expect(
      applySignalEvents(
        SIGNAL_SCORE_MAX,
        Array(10).fill("verifiedUniqueIssue"),
      ),
    ).toBe(SIGNAL_SCORE_MAX);
    expect(applySignalEvents(SIGNAL_SCORE_MIN, Array(10).fill("noise"))).toBe(
      SIGNAL_SCORE_MIN,
    );
  });

  it("moves a tester the way their reports do", () => {
    const after = applySignalEvents(100, [
      "verifiedUniqueIssue",
      "attachedToVerified",
      "noise",
    ]);
    expect(after).toBe(102);
  });

  it("rate-limits below the threshold and not at it", () => {
    expect(isRateLimited(RATE_LIMIT_BELOW_SCORE - 1)).toBe(true);
    expect(isRateLimited(RATE_LIMIT_BELOW_SCORE)).toBe(false);
    expect(hourlyReportAllowance(RATE_LIMIT_BELOW_SCORE - 1)).toBe(5);
    expect(hourlyReportAllowance(100)).toBe(Infinity);
  });

  it("never silences a low-scoring tester entirely", () => {
    // Someone who has filed noise may still find the crash nobody else did.
    expect(hourlyReportAllowance(0)).toBeGreaterThan(0);
  });

  it("rounds rather than accumulating fractions", () => {
    expect(applySignalEvent(99.4, "attachedToVerified")).toBe(100);
  });
});
