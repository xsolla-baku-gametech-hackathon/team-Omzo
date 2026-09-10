import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

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

  for (const [index, report] of reports.entries()) {
    const response = await fetch(`${BASE_URL}/api/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        reporterId: report.reporterId,
        body: report.body,
        gameState: report.gameState,
        systemInfo: report.systemInfo,
        consoleTail: report.consoleTail,
        // The fixture id doubles as the idempotency key, which is what makes
        // re-running the seed a no-op rather than a second campaign's worth
        // of duplicate occurrences.
        clientReportId: report.id,
      }),
    });

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
