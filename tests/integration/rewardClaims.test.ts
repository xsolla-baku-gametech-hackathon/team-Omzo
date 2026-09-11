import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { claimKey } from "@/domain/rewards/catalogue";
import { db } from "@/server/db";
import {
  ClaimRefusedError,
  RewardItemNotFoundError,
  cancelClaim,
  claimReward,
  fulfilClaim,
} from "@/server/services/rewardClaimService";

/**
 * Spending coins, against a real database.
 *
 * The two races here cannot be mocked without the mock becoming the same
 * person's opinion twice: what is asserted is that Postgres rejects a
 * duplicate key and holds a row lock under genuine concurrency.
 */

const suffix = randomUUID().slice(0, 8);
const OWNER_ID = `rc-owner-${suffix}`;
const STUDIO_ID = `rc-studio-${suffix}`;
const CAMPAIGN_ID = `rc-campaign-${suffix}`;
const TESTER_ID = `rc-tester-${suffix}`;
const OTHER_ID = `rc-other-${suffix}`;
const OUTSIDER_ID = `rc-outsider-${suffix}`;

async function giveCoins(userId: string, amount: number): Promise<void> {
  await db.ledgerEntry.create({
    data: {
      userId,
      campaignId: CAMPAIGN_ID,
      amount,
      reason: "MANUAL_ADJUSTMENT",
      idempotencyKey: `rc-grant-${userId}-${randomUUID().slice(0, 8)}`,
    },
  });
}

async function makeItem(over: {
  costCoins?: number;
  totalStock?: number;
  label?: string;
}): Promise<string> {
  const item = await db.rewardItem.create({
    data: {
      campaignId: CAMPAIGN_ID,
      kind: "STEAM_KEY",
      label: over.label ?? "Steam key",
      costCoins: over.costCoins ?? 100,
      totalStock: over.totalStock ?? 5,
    },
    select: { id: true },
  });
  return item.id;
}

async function balanceOf(userId: string): Promise<number> {
  const row = await db.ledgerEntry.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return row._sum.amount ?? 0;
}

beforeAll(async () => {
  await db.user.createMany({
    data: [
      {
        id: OWNER_ID,
        email: `${OWNER_ID}@example.test`,
        passwordHash: "x",
        displayName: "Claim Studio",
        role: "STUDIO",
      },
      {
        id: TESTER_ID,
        email: `${TESTER_ID}@example.test`,
        passwordHash: "x",
        displayName: "Claim Tester",
        role: "TESTER",
      },
      {
        id: OTHER_ID,
        email: `${OTHER_ID}@example.test`,
        passwordHash: "x",
        displayName: "Other Tester",
        role: "TESTER",
      },
      {
        id: OUTSIDER_ID,
        email: `${OUTSIDER_ID}@example.test`,
        passwordHash: "x",
        displayName: "Outsider",
        role: "TESTER",
      },
    ],
  });
  await db.studio.create({
    data: { id: STUDIO_ID, name: "Claim Studio", ownerId: OWNER_ID },
  });
  await db.campaign.create({
    data: {
      id: CAMPAIGN_ID,
      studioId: STUDIO_ID,
      title: "Claim campaign",
      pitch: "-",
      testFocus: "-",
      buildKind: "EXTERNAL_LINK",
      buildUrl: "https://example.test/build",
      ndaBodyMd: "-",
      applicationOpensAt: new Date(),
      applicationClosesAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      testingStartsAt: new Date(),
      testingEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
  // Participation. The outsider deliberately signs nothing.
  await db.ndaSignature.createMany({
    data: [TESTER_ID, OTHER_ID].map((userId) => ({
      userId,
      campaignId: CAMPAIGN_ID,
      typedName: "Test Tester",
      ndaBodyHash: "-",
      ipHash: "-",
      userAgent: "-",
    })),
  });
});

afterAll(async () => {
  await db.rewardClaim.deleteMany({
    where: { rewardItem: { campaignId: CAMPAIGN_ID } },
  });
  await db.rewardItem.deleteMany({ where: { campaignId: CAMPAIGN_ID } });
  await db.ledgerEntry.deleteMany({ where: { campaignId: CAMPAIGN_ID } });
  await db.ndaSignature.deleteMany({ where: { campaignId: CAMPAIGN_ID } });
  await db.campaign.deleteMany({ where: { id: CAMPAIGN_ID } });
  await db.studio.deleteMany({ where: { id: STUDIO_ID } });
  await db.user.deleteMany({
    where: { id: { in: [OWNER_ID, TESTER_ID, OTHER_ID, OUTSIDER_ID] } },
  });
});

describe("a double-claimed reward debits once", () => {
  it("holds under two simultaneous claims of the same item", async () => {
    const itemId = await makeItem({ costCoins: 100, totalStock: 5 });
    await giveCoins(TESTER_ID, 500);
    const before = await balanceOf(TESTER_ID);

    // The double-clicked button, as concurrently as this can be made.
    const [a, b] = await Promise.all([
      claimReward({ userId: TESTER_ID, rewardItemId: itemId }),
      claimReward({ userId: TESTER_ID, rewardItemId: itemId }),
    ]);

    // Exactly one of the two did the work; both return an answer.
    expect([a.claimed, b.claimed].filter(Boolean)).toHaveLength(1);

    const entries = await db.ledgerEntry.findMany({
      where: { userId: TESTER_ID, reason: "REWARD_CLAIMED" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.amount).toBe(-100);
    expect(entries[0]!.idempotencyKey).toBe(claimKey(TESTER_ID, itemId));

    const claims = await db.rewardClaim.findMany({
      where: { userId: TESTER_ID, rewardItemId: itemId },
    });
    expect(claims).toHaveLength(1);

    const item = await db.rewardItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    expect(item.claimedCount).toBe(1);
    expect(await balanceOf(TESTER_ID)).toBe(before - 100);
  });
});

describe("the last key in the box", () => {
  it("goes to exactly one of two testers reaching for it", async () => {
    // Different testers means different idempotency keys, so the unique
    // constraint cannot help here — only the row lock can.
    const itemId = await makeItem({ costCoins: 50, totalStock: 1 });
    await giveCoins(TESTER_ID, 200);
    await giveCoins(OTHER_ID, 200);

    const results = await Promise.allSettled([
      claimReward({ userId: TESTER_ID, rewardItemId: itemId }),
      claimReward({ userId: OTHER_ID, rewardItemId: itemId }),
    ]);

    const won = results.filter(
      (r) => r.status === "fulfilled" && r.value.claimed,
    );
    const lost = results.filter(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof ClaimRefusedError &&
        r.reason.reason === "out_of_stock",
    );
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    const item = await db.rewardItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    expect(item.claimedCount).toBe(1);
  });
});

describe("a balance cannot go negative", () => {
  it("refuses the second of two different items it cannot cover", async () => {
    const cheap = await makeItem({
      costCoins: 60,
      totalStock: 5,
      label: "Cheap",
    });
    const other = await makeItem({
      costCoins: 60,
      totalStock: 5,
      label: "Also cheap",
    });
    const poor = OUTSIDER_ID;
    await db.ndaSignature.create({
      data: {
        userId: poor,
        campaignId: CAMPAIGN_ID,
        typedName: "Poor Tester",
        ndaBodyHash: "-",
        ipHash: "-",
        userAgent: "-",
      },
    });
    await giveCoins(poor, 100);

    // Two different items, so two different keys. Only the user lock keeps
    // these from both reading a balance of 100 and both spending it.
    const results = await Promise.allSettled([
      claimReward({ userId: poor, rewardItemId: cheap }),
      claimReward({ userId: poor, rewardItemId: other }),
    ]);

    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.claimed,
    );
    expect(succeeded).toHaveLength(1);
    expect(await balanceOf(poor)).toBe(40);
  });
});

describe("coins are spent with the campaign that paid them", () => {
  it("will not fund one studio's shelf from another studio's playtest", async () => {
    // The tester is rich overall and broke here. Spending across campaigns
    // would mean this studio handing out a key for work done for another,
    // which points the economy at the wrong studio.
    const otherCampaignId = `rc-other-campaign-${suffix}`;
    await db.campaign.create({
      data: {
        id: otherCampaignId,
        studioId: STUDIO_ID,
        title: "Another campaign",
        pitch: "-",
        testFocus: "-",
        buildKind: "EXTERNAL_LINK",
        buildUrl: "https://example.test/other",
        ndaBodyMd: "-",
        applicationOpensAt: new Date(),
        applicationClosesAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        testingStartsAt: new Date(),
        testingEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    const richElsewhere = `rc-rich-${suffix}`;
    await db.user.create({
      data: {
        id: richElsewhere,
        email: `${richElsewhere}@example.test`,
        passwordHash: "x",
        displayName: "Rich Elsewhere",
        role: "TESTER",
      },
    });
    await db.ndaSignature.create({
      data: {
        userId: richElsewhere,
        campaignId: CAMPAIGN_ID,
        typedName: "Rich Elsewhere",
        ndaBodyHash: "-",
        ipHash: "-",
        userAgent: "-",
      },
    });
    // 5,000 coins — all of them earned somewhere else.
    await db.ledgerEntry.create({
      data: {
        userId: richElsewhere,
        campaignId: otherCampaignId,
        amount: 5_000,
        reason: "ISSUE_VERIFIED",
        idempotencyKey: `rc-rich-grant-${suffix}`,
      },
    });

    const itemId = await makeItem({ costCoins: 100, totalStock: 5 });
    await expect(
      claimReward({ userId: richElsewhere, rewardItemId: itemId }),
    ).rejects.toMatchObject({ reason: "insufficient_balance" });

    // Give them a hundred here and the same claim goes through.
    await db.ledgerEntry.create({
      data: {
        userId: richElsewhere,
        campaignId: CAMPAIGN_ID,
        amount: 100,
        reason: "ISSUE_VERIFIED",
        idempotencyKey: `rc-rich-local-${suffix}`,
      },
    });
    await expect(
      claimReward({ userId: richElsewhere, rewardItemId: itemId }),
    ).resolves.toMatchObject({ claimed: true, spent: 100, balanceAfter: 0 });

    await db.rewardClaim.deleteMany({ where: { userId: richElsewhere } });
    await db.ledgerEntry.deleteMany({ where: { userId: richElsewhere } });
    await db.campaign.deleteMany({ where: { id: otherCampaignId } });
    await db.ndaSignature.deleteMany({ where: { userId: richElsewhere } });
    await db.user.deleteMany({ where: { id: richElsewhere } });
  });
});

describe("participation", () => {
  it("hides a shelf from someone who never joined the campaign", async () => {
    const itemId = await makeItem({ costCoins: 10, totalStock: 5 });
    const stranger = `rc-stranger-${suffix}`;
    await db.user.create({
      data: {
        id: stranger,
        email: `${stranger}@example.test`,
        passwordHash: "x",
        displayName: "Stranger",
        role: "TESTER",
      },
    });
    // No signature here and no ledger row here: nothing ties them to this
    // campaign at all. Not found rather than forbidden, so the id is not
    // confirmed to someone who should not know it exists.
    await expect(
      claimReward({ userId: stranger, rewardItemId: itemId }),
    ).rejects.toBeInstanceOf(RewardItemNotFoundError);

    await db.ledgerEntry.deleteMany({ where: { userId: stranger } });
    await db.user.deleteMany({ where: { id: stranger } });
  });
});

describe("fulfilment", () => {
  it("records the studio's code and refuses a second resolution", async () => {
    const itemId = await makeItem({ costCoins: 10, totalStock: 3 });
    await giveCoins(OTHER_ID, 100);
    const outcome = await claimReward({
      userId: OTHER_ID,
      rewardItemId: itemId,
    });
    expect(outcome.claimed).toBe(true);

    await fulfilClaim({
      claimId: outcome.claimId,
      studioId: STUDIO_ID,
      code: "DEEPFALL-XXXX-YYYY",
    });

    const claim = await db.rewardClaim.findUniqueOrThrow({
      where: { id: outcome.claimId },
    });
    expect(claim.status).toBe("FULFILLED");
    expect(claim.fulfilledCode).toBe("DEEPFALL-XXXX-YYYY");
    expect(claim.resolvedAt).not.toBeNull();

    // A resolved claim is closed. Cancelling it now would refund coins for a
    // key the tester already has.
    await expect(
      cancelClaim({ claimId: outcome.claimId, studioId: STUDIO_ID }),
    ).rejects.toThrow(/already been resolved/);
  });

  it("returns the coins and the unit to stock when a studio cannot supply", async () => {
    const itemId = await makeItem({ costCoins: 40, totalStock: 1 });
    await giveCoins(TESTER_ID, 100);
    const before = await balanceOf(TESTER_ID);

    const outcome = await claimReward({
      userId: TESTER_ID,
      rewardItemId: itemId,
    });
    expect(await balanceOf(TESTER_ID)).toBe(before - 40);

    await cancelClaim({ claimId: outcome.claimId, studioId: STUDIO_ID });

    expect(await balanceOf(TESTER_ID)).toBe(before);
    const item = await db.rewardItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    expect(item.claimedCount).toBe(0);

    // The claim row survives, so re-taking the item the studio just said it
    // could not supply is a no-op rather than a second debit — the rest of
    // the shelf is open to them, with their balance restored.
    await expect(
      claimReward({ userId: TESTER_ID, rewardItemId: itemId }),
    ).resolves.toMatchObject({ claimed: false, spent: 0 });
    expect(await balanceOf(TESTER_ID)).toBe(before);
  });
});
