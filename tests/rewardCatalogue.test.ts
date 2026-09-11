import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CLAIM_REFUSAL_MESSAGE,
  REWARD_KINDS,
  REWARD_KIND_COST_TO_STUDIO,
  REWARD_KIND_LABEL,
  canClaim,
  claimDebitAmount,
  claimKey,
  claimRefundKey,
  remainingStock,
  type RewardItemView,
} from "@/domain/rewards/catalogue";
import { balanceOf, poolSpent, verificationKey } from "@/domain/rewards/ledger";

const SCHEMA = fileURLToPath(
  new URL("../prisma/schema.prisma", import.meta.url),
);

function item(over: Partial<RewardItemView> = {}): RewardItemView {
  return {
    id: "r-1",
    kind: "STEAM_KEY",
    label: "Steam key — Deepfall",
    costCoins: 500,
    totalStock: 10,
    claimedCount: 0,
    ...over,
  };
}

describe("the reward shelf", () => {
  it("covers exactly the kinds the database can store", () => {
    const source = readFileSync(SCHEMA, "utf8");
    const block = /enum RewardKind \{([^}]*)\}/.exec(source);
    const members = block![1]
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, "").trim())
      .filter((line) => line.length > 0);
    expect([...REWARD_KINDS].sort()).toEqual(members.sort());
  });

  it("labels every kind and says what it costs the studio", () => {
    for (const kind of REWARD_KINDS) {
      expect(REWARD_KIND_LABEL[kind]).toBeTypeOf("string");
      expect(REWARD_KIND_COST_TO_STUDIO[kind]).toBeTypeOf("string");
    }
    // The order is the argument: the cheapest things to give away are the ones
    // a studio should stock first.
    expect(REWARD_KINDS[0]).toBe("CREDITS_MENTION");
    expect(REWARD_KINDS[REWARD_KINDS.length - 1]).toBe("STEAM_KEY");
  });

  it("never reports negative stock", () => {
    // An over-claimed row is a bug, not a reason to render "-2 left".
    expect(remainingStock(item({ totalStock: 3, claimedCount: 5 }))).toBe(0);
    expect(remainingStock(item({ totalStock: 3, claimedCount: 1 }))).toBe(2);
  });
});

describe("claim keys", () => {
  it("scopes a claim to one tester and one item", () => {
    expect(claimKey("u-1", "r-1")).toBe("claim:u-1:r-1");
    expect(claimKey("u-1", "r-1")).toBe(claimKey("u-1", "r-1"));
    expect(claimKey("u-2", "r-1")).not.toBe(claimKey("u-1", "r-1"));
    expect(claimKey("u-1", "r-2")).not.toBe(claimKey("u-1", "r-1"));
  });

  it("cannot collide with a verification or a refund", () => {
    // All three land in the same unique column. A collision would mean a
    // payout silently cancelling a claim, or worse.
    const keys = [
      claimKey("u-1", "r-1"),
      claimRefundKey("c-1"),
      verificationKey("i-1"),
    ];
    expect(new Set(keys).size).toBe(3);
  });
});

describe("whether a tester may claim", () => {
  it("allows it when they can afford it and there is stock", () => {
    expect(
      canClaim({ balance: 500, item: item(), alreadyClaimed: false }),
    ).toEqual({ allowed: true });
  });

  it("allows spending the balance down to exactly zero", () => {
    expect(
      canClaim({
        balance: 500,
        item: item({ costCoins: 500 }),
        alreadyClaimed: false,
      }).allowed,
    ).toBe(true);
  });

  it("refuses one coin short", () => {
    const verdict = canClaim({
      balance: 499,
      item: item({ costCoins: 500 }),
      alreadyClaimed: false,
    });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("insufficient_balance");
  });

  it("refuses when the shelf is empty, whatever the balance", () => {
    const verdict = canClaim({
      balance: 999_999,
      item: item({ totalStock: 2, claimedCount: 2 }),
      alreadyClaimed: false,
    });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("out_of_stock");
  });

  it("says 'already claimed' before anything else", () => {
    // The tester has the thing. Telling them they cannot afford something
    // they already own, or that it is out of stock, would be nonsense.
    const verdict = canClaim({
      balance: 0,
      item: item({ totalStock: 1, claimedCount: 1 }),
      alreadyClaimed: true,
    });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("already_claimed");
  });

  it("has a message for every refusal", () => {
    for (const reason of [
      "insufficient_balance",
      "out_of_stock",
      "already_claimed",
    ] as const) {
      expect(CLAIM_REFUSAL_MESSAGE[reason].length).toBeGreaterThan(0);
    }
  });
});

describe("the debit", () => {
  it("is always negative, whatever the column holds", () => {
    expect(claimDebitAmount(item({ costCoins: 500 }))).toBe(-500);
    // A negative cost stored by mistake must not turn a claim into a payout.
    expect(claimDebitAmount(item({ costCoins: -500 }))).toBe(-500);
  });

  it("reduces the balance without refunding the campaign's pool", () => {
    // The whole reason a claim is safe in this ledger. If REWARD_CLAIMED
    // counted as pool spending, this tester cashing in would hand the studio
    // 500 coins of headroom back and the campaign could overpay its promise.
    const entries = [
      {
        userId: "u-1",
        campaignId: "c-1",
        issueId: "i-1",
        amount: 800,
        reason: "ISSUE_VERIFIED" as const,
        idempotencyKey: verificationKey("i-1"),
      },
      {
        userId: "u-1",
        campaignId: "c-1",
        issueId: null,
        amount: claimDebitAmount(item({ costCoins: 500 })),
        reason: "REWARD_CLAIMED" as const,
        idempotencyKey: claimKey("u-1", "r-1"),
      },
    ];

    expect(balanceOf(entries)).toBe(300);
    expect(poolSpent(entries)).toBe(800);
  });

  it("restores both the balance and nothing else on a refund", () => {
    const entries = [
      {
        userId: "u-1",
        campaignId: "c-1",
        issueId: null,
        amount: -500,
        reason: "REWARD_CLAIMED" as const,
        idempotencyKey: claimKey("u-1", "r-1"),
      },
      {
        userId: "u-1",
        campaignId: "c-1",
        issueId: null,
        amount: 500,
        reason: "CLAIM_REFUNDED" as const,
        idempotencyKey: claimRefundKey("c-1"),
      },
    ];
    expect(balanceOf(entries)).toBe(0);
    expect(poolSpent(entries)).toBe(0);
  });
});
