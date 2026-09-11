import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { signGrantToken } from "../src/domain/access/token";
import { requireSecret } from "../src/server/config/secrets";
import { BUG_TEMPLATES } from "./fixtures/bugTemplates";
import { expandFixture } from "./fixtures/expand";

/**
 * Seeds a campaign by posting every fixture report through POST /api/ingest.
 *
 * It does not write Report or Issue rows itself, and that is the whole point
 * (SPEC.md §0, rule 1). A seed that inserted rows directly would prove the
 * database works and nothing else: the numbers on the board would come from a
 * path no real report ever takes, and the first live report through the
 * overlay would be the first time the ingest path ran at all.
 *
 * Ingest is authenticated, so the seed mints a real build access token per
 * tester and sends it as a bearer credential. It gets no special case on the
 * server: a seed that took a backdoor would stop proving the auth path works,
 * which is the same mistake as writing the rows directly.
 */

const db = new PrismaClient();

const BASE_URL = process.env.SEED_BASE_URL ?? "http://localhost:3000";
const SEED_PASSWORD = "playtest-demo-2026";

const STUDIO_USER_ID = "seed-studio-owner";
const STUDIO_ID = "seed-studio";
const CAMPAIGN_ID = "seed-campaign";

const NDA_BODY = `# Playtest Non-Disclosure Agreement

You are being given access to an unreleased build. By signing you agree:

1. Not to share, stream, record or describe the build publicly.
2. Not to distribute the build or any part of it.
3. That your access is personal and traceable to you.

This agreement ends on the build's public release.`;

async function ensureServerIsRunning(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/ingest`, { method: "HEAD" });
  } catch {
    throw new Error(
      `Cannot reach ${BASE_URL}. The seed posts through the real ingest ` +
        `endpoint, so the dev server has to be running: pnpm dev`,
    );
  }
}

async function seedAccounts(passwordHash: string): Promise<void> {
  await db.user.upsert({
    where: { id: STUDIO_USER_ID },
    update: {},
    create: {
      id: STUDIO_USER_ID,
      email: "studio@repro.dev",
      passwordHash,
      displayName: "Northwind Interactive",
      role: "STUDIO",
      birthDate: new Date("1990-01-01"),
    },
  });

  await db.studio.upsert({
    where: { id: STUDIO_ID },
    update: {},
    create: {
      id: STUDIO_ID,
      name: "Northwind Interactive",
      ownerId: STUDIO_USER_ID,
    },
  });

  await db.campaign.upsert({
    where: { id: CAMPAIGN_ID },
    update: { status: "OPEN", revokedAt: null },
    create: {
      id: CAMPAIGN_ID,
      studioId: STUDIO_ID,
      title: "Vault Descent — closed technical playtest",
      pitch:
        "A first-person facility crawler. This build covers the atrium " +
        "through to the vault, roughly forty minutes of play. Lighting and " +
        "audio are close to final; enemy behaviour is not.",
      testFocus:
        "Break the traversal. We especially want the lift, the loading bay " +
        "ramp and the stairwell doors — anywhere you can leave the level or " +
        "get stuck in it.",
      buildKind: "WEB_EMBED",
      buildUrl: "/play/seed-campaign/session",
      ndaBodyMd: NDA_BODY,
      rewardPoolTotal: 5000,
      rewardPerIssue: 50,
      maxTesters: 200,
    },
  });

  await seedRewardShelf();
}

/**
 * What the demo campaign's coins are worth.
 *
 * Ordered by what each costs the studio, cheapest first — which is also the
 * order a studio should stock them in. A credits mention costs nothing and is
 * worth something real to a tester; that asymmetry is the whole reason the
 * economy works without anyone buying coins.
 */
async function seedRewardShelf(): Promise<void> {
  const shelf = [
    {
      id: "seed-reward-credits",
      kind: "CREDITS_MENTION" as const,
      label: "Your name in the credits",
      costCoins: 150,
      totalStock: 50,
    },
    {
      id: "seed-reward-early",
      kind: "EARLY_ACCESS" as const,
      label: "First pick on the next playtest",
      costCoins: 250,
      totalStock: 25,
    },
    {
      id: "seed-reward-item",
      kind: "ITEM_CODE" as const,
      label: "Vault Descent — prototype skin code",
      costCoins: 400,
      totalStock: 15,
    },
    {
      id: "seed-reward-key",
      kind: "STEAM_KEY" as const,
      label: "Steam key — Vault Descent, on release",
      costCoins: 800,
      // Deliberately scarce. A shelf where everything is always available
      // never exercises the out-of-stock path the demo is meant to show.
      totalStock: 3,
    },
  ];

  for (const item of shelf) {
    await db.rewardItem.upsert({
      where: { id: item.id },
      update: {
        label: item.label,
        costCoins: item.costCoins,
        totalStock: item.totalStock,
      },
      create: { ...item, campaignId: CAMPAIGN_ID },
    });
  }
}

async function seedTesters(
  reporterIds: readonly string[],
  passwordHash: string,
): Promise<void> {
  for (const id of reporterIds) {
    const number = id.replace("tester-", "");
    await db.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        email: `${id}@testers.repro.dev`,
        passwordHash,
        displayName: `Tester ${number}`,
        role: "TESTER",
        birthDate: new Date("1998-06-15"),
      },
    });
  }
}

interface IngestResponse {
  readonly decision: string;
  readonly deduplicated: boolean;
}

async function main(): Promise<void> {
  await ensureServerIsRunning();

  const reports = expandFixture();
  const reporterIds = [...new Set(reports.map((r) => r.reporterId))].sort();

  console.log(
    `seeding ${reports.length} reports from ${BUG_TEMPLATES.length} bugs ` +
      `across ${reporterIds.length} testers`,
  );

  // One hash, reused. bcrypt at cost 12 is deliberately slow (§6.5) and every
  // seeded account shares the same demo password anyway.
  const passwordHash = await hash(SEED_PASSWORD, 12);

  await seedAccounts(passwordHash);
  await seedTesters(reporterIds, passwordHash);

  const tally = new Map<string, number>();
  let deduplicated = 0;

  const accessSecret = requireSecret("ACCESS_SECRET");
  /** One token per tester, reused across that tester's reports. */
  const tokens = new Map<string, string>();
  const grantTokenFor = (reporterId: string): string => {
    const existing = tokens.get(reporterId);
    if (existing !== undefined) return existing;

    const token = signGrantToken(
      {
        grantId: `seed-grant-${reporterId}`,
        campaignId: CAMPAIGN_ID,
        userId: reporterId,
        watermarkId: 0,
        // Long enough to outlast a full seed run of several hundred reports.
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
      },
      accessSecret,
    );
    tokens.set(reporterId, token);
    return token;
  };

  /**
   * Ingest is rate limited per tester, and the fixtures are deliberately
   * lopsided — the busiest testers file hundreds of reports, because that
   * skew is what makes the clustering demo look like real playtest traffic.
   * A bulk loader therefore hits 429 by design.
   *
   * The seed waits and retries rather than the limit being raised to
   * accommodate it. Loosening a security control so a script can finish
   * faster is the wrong trade, and honouring Retry-After is what any correct
   * client does anyway, so this exercises that path too.
   */
  const postReport = async (
    report: (typeof reports)[number],
  ): Promise<Response> => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await fetch(`${BASE_URL}/api/ingest`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${grantTokenFor(report.reporterId)}`,
        },
        body: JSON.stringify({
          campaignId: CAMPAIGN_ID,
          body: report.body,
          gameState: report.gameState,
          systemInfo: report.systemInfo,
          consoleTail: report.consoleTail,
          // The fixture id doubles as the idempotency key, which is what
          // makes re-running the seed a no-op rather than a second
          // campaign's worth of duplicate occurrences.
          clientReportId: report.id,
        }),
      });

      if (response.status !== 429) return response;

      const retryAfterSec = Number(response.headers.get("retry-after") ?? "1");
      const waitMs = Math.max(250, retryAfterSec * 1000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    throw new Error(
      `ingest kept rate limiting ${report.id} after 20 attempts. Is another ` +
        `seed run in progress?`,
    );
  };

  for (const [index, report] of reports.entries()) {
    const response = await postReport(report);

    if (!response.ok && response.status !== 200) {
      const detail = await response.text();
      throw new Error(
        `ingest rejected ${report.id} (${response.status}): ${detail}`,
      );
    }

    const outcome = (await response.json()) as IngestResponse;
    tally.set(outcome.decision, (tally.get(outcome.decision) ?? 0) + 1);
    if (outcome.deduplicated) deduplicated += 1;

    if ((index + 1) % 50 === 0) {
      console.log(`  ${index + 1}/${reports.length}`);
    }
  }

  const issues = await db.issue.findMany({
    where: { campaignId: CAMPAIGN_ID },
    orderBy: { occurrenceCount: "desc" },
    select: { title: true, severity: true, occurrenceCount: true },
  });

  console.log(
    `\ndecisions: ${[...tally].map(([k, v]) => `${k} ${v}`).join(", ")}`,
  );
  if (deduplicated > 0) {
    console.log(
      `${deduplicated} already present — re-running the seed changes nothing`,
    );
  }
  console.log(`\n${issues.length} issues from ${reports.length} reports:\n`);
  for (const issue of issues.slice(0, 15)) {
    console.log(
      `  ${String(issue.occurrenceCount).padStart(3)}  ${issue.severity.padEnd(8)}  ${issue.title.slice(0, 60)}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
