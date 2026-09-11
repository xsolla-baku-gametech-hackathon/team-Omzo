import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PoolExhaustedError, verificationKey } from "@/domain/rewards/ledger";
import { db } from "@/server/db";
import { payVerificationReward } from "@/server/services/rewardService";

/**
 * The idempotency guarantee, against a real database.
 *
 * This one cannot be mocked. What is being asserted is that Postgres rejects
 * the second insert of a duplicate key under genuine concurrency -- a mock
 * would only assert that the mock was written to agree with the code, which
 * is the same person's opinion twice.
 */

const suffix = randomUUID().slice(0, 8);
const OWNER_ID = `it-owner-${suffix}`;
const STUDIO_ID = `it-studio-${suffix}`;
const CAMPAIGN_ID = `it-campaign-${suffix}`;
const TESTER_ID = `it-tester-${suffix}`;
const ISSUE_ID = `it-issue-${suffix}`;
const REWARD = 50;
const POOL = 500;

async function seedCampaign(): Promise<void> {
  await db.user.create({
    data: {
      id: OWNER_ID,
      email: `${OWNER_ID}@example.test`,
      passwordHash: "x",
      displayName: "Integration Studio",
      role: "STUDIO",
    },
  });
  await db.user.create({
    data: {
      id: TESTER_ID,
      email: `${TESTER_ID}@example.test`,
      passwordHash: "x",
      displayName: "Integration Tester",
      role: "TESTER",
    },
  });
  await db.studio.create({
    data: { id: STUDIO_ID, name: "Integration Studio", ownerId: OWNER_ID },
  });
  await db.campaign.create({
    data: {
      id: CAMPAIGN_ID,
      studioId: STUDIO_ID,
      title: "Integration campaign",
      pitch: "-",
      testFocus: "-",
      buildKind: "WEB_EMBED",
      buildUrl: "-",
      ndaBodyMd: "-",
      rewardPoolTotal: POOL,
      rewardPerIssue: REWARD,
      applicationOpensAt: new Date(),
      applicationClosesAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      testingStartsAt: new Date(),
      testingEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
  await db.issue.create({
    data: {
      id: ISSUE_ID,
      campaignId: CAMPAIGN_ID,
      title: "Integration issue",
      category: "CRASH",
      severity: "CRITICAL",
      firstReporterId: TESTER_ID,
      occurrenceCount: 1,
      signature: "",
      sharedTraits: {},
    },
  });
  await db.report.create({
    data: {
      id: `it-report-${suffix}`,
      campaignId: CAMPAIGN_ID,
      reporterId: TESTER_ID,
      issueId: ISSUE_ID,
      body: "The lift jams and the game stops responding",
      gameState: { scene: "atrium", x: 128, y: 0, z: 96, playtimeSec: 300 },
      systemInfo: {
        os: "Windows 11",
        browser: "Chrome 131",
        gpuRenderer: "AMD Radeon RX 6800",
        screen: "2560x1440",
      },
      consoleTail: [],
      signature: "",
      tokens: ["lift", "jam", "game", "crash"],
      normalisedBody: "the lift jams and the game stops responding",
    },
  });
}

beforeAll(async () => {
  await seedCampaign();
});

afterAll(async () => {
  await db.report.deleteMany({ where: { campaignId: CAMPAIGN_ID } });
  await db.ledgerEntry.deleteMany({ where: { campaignId: CAMPAIGN_ID } });
  await db.issue.deleteMany({ where: { campaignId: CAMPAIGN_ID } });
  await db.campaign.deleteMany({ where: { id: CAMPAIGN_ID } });
  await db.studio.deleteMany({ where: { id: STUDIO_ID } });
  await db.user.deleteMany({ where: { id: { in: [OWNER_ID, TESTER_ID] } } });
  await db.$disconnect();
});

describe("verifying an issue fifty times in parallel", () => {
  it("writes exactly one ledger row", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 50 }, () => payVerificationReward(ISSUE_ID)),
    );

    const rows = await db.ledgerEntry.findMany({
      where: { idempotencyKey: verificationKey(ISSUE_ID) },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(REWARD);
    expect(rows[0].userId).toBe(TESTER_ID);

    // Exactly one caller is told it paid. The other 49 are told the truth --
    // that the reward was already settled -- rather than being handed an error
    // for doing nothing wrong.
    expect(attempts.filter((attempt) => attempt.paid)).toHaveLength(1);
    expect(
      attempts.every(
        (attempt) => attempt.idempotencyKey === rows[0].idempotencyKey,
      ),
    ).toBe(true);
  });

  it("pays the tester once, not fifty times", async () => {
    const balance = await db.ledgerEntry.aggregate({
      where: { userId: TESTER_ID },
      _sum: { amount: true },
    });
    expect(balance._sum.amount).toBe(REWARD);
  });

  it("moves the first reporter's standing exactly once", async () => {
    const tester = await db.user.findUniqueOrThrow({
      where: { id: TESTER_ID },
      select: { signalScore: true },
    });
    // Started at the default 100, gained 3 for a verified unique issue.
    expect(tester.signalScore).toBe(103);
  });
});

describe("a pool that cannot cover the payout", () => {
  it("refuses rather than letting the studio owe more than it funded", async () => {
    const poorSuffix = randomUUID().slice(0, 8);
    const campaignId = `it-poor-campaign-${poorSuffix}`;
    const issueId = `it-poor-issue-${poorSuffix}`;

    await db.campaign.create({
      data: {
        id: campaignId,
        studioId: STUDIO_ID,
        title: "Underfunded campaign",
        pitch: "-",
        testFocus: "-",
        buildKind: "WEB_EMBED",
        buildUrl: "-",
        ndaBodyMd: "-",
        // Funded for one payout, with two issues to verify.
        rewardPoolTotal: REWARD,
        rewardPerIssue: REWARD,
        applicationOpensAt: new Date(),
        applicationClosesAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        testingStartsAt: new Date(),
        testingEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    const makeIssue = async (id: string) =>
      db.issue.create({
        data: {
          id,
          campaignId,
          title: "Underfunded issue",
          category: "CRASH",
          severity: "CRITICAL",
          firstReporterId: TESTER_ID,
          occurrenceCount: 1,
          signature: "",
          sharedTraits: {},
        },
      });

    await makeIssue(issueId);
    await makeIssue(`${issueId}-second`);

    const first = await payVerificationReward(issueId);
    expect(first.paid).toBe(true);

    await expect(
      payVerificationReward(`${issueId}-second`),
    ).rejects.toBeInstanceOf(PoolExhaustedError);

    const spent = await db.ledgerEntry.aggregate({
      where: { campaignId },
      _sum: { amount: true },
    });
    expect(spent._sum.amount).toBe(REWARD);

    await db.ledgerEntry.deleteMany({ where: { campaignId } });
    await db.issue.deleteMany({ where: { campaignId } });
    await db.campaign.deleteMany({ where: { id: campaignId } });
  });
});
