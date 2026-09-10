import { randomUUID } from "node:crypto";

import type { Prisma, Report as ReportRow } from "@prisma/client";

import { ingest, rebuildIssue } from "@/domain/triage/cluster";
import type { TriageState } from "@/domain/triage/cluster";
import type {
  Decision,
  GameState,
  IncomingReport,
  Issue,
  PreparedReport,
  SystemInfo,
} from "@/domain/triage/types";
import { db } from "@/server/db";
import { sharedTraitsOf, toPreparedReport } from "@/server/reportMapping";
import { campaignEvents } from "@/server/events";

/**
 * Ingest orchestration: load, decide, persist.
 *
 * Every decision is made in src/domain/triage. This file loads rows, hands
 * the domain plain data, and writes back what it returns. It holds no rule
 * about what counts as a duplicate and must not grow one -- the moment
 * clustering logic appears on this side of the boundary it stops being
 * testable without a database.
 */

export interface IngestInput {
  readonly campaignId: string;
  readonly reporterId: string;
  readonly body: string;
  readonly gameState: GameState;
  readonly systemInfo: SystemInfo;
  readonly consoleTail: readonly string[];
  readonly screenshotData?: string;
  /** Supplied by the overlay so a retried submission is not counted twice. */
  readonly clientReportId?: string;
}

export interface IngestOutcome {
  readonly reportId: string;
  readonly decision: Decision["kind"];
  readonly issueId: string | null;
  readonly issueTitle: string | null;
  readonly occurrenceCount: number | null;
  /** True when this call recognised an earlier submission of the same report. */
  readonly deduplicated: boolean;
}

export class CampaignNotOpenError extends Error {
  constructor(readonly campaignId: string) {
    super("This campaign is not accepting reports.");
    this.name = "CampaignNotOpenError";
  }
}

/**
 * Reconstruct the campaign exactly as the fold left it.
 *
 * Issues are rebuilt from their reports through the same function that
 * created them, so every Issue column is a materialised view of its reports
 * rather than an independent source of truth that could drift out of step.
 */
function toTriageState(rows: readonly ReportRow[]): TriageState {
  const ordered = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const noise: PreparedReport[] = [];
  const byIssue = new Map<
    string,
    { reports: PreparedReport[]; possible: PreparedReport[] }
  >();

  for (const row of ordered) {
    const prepared = toPreparedReport(row);
    if (row.isNoise) {
      noise.push(prepared);
      continue;
    }
    if (row.issueId === null) continue;

    const bucket = byIssue.get(row.issueId) ?? { reports: [], possible: [] };
    if (row.isPossibleDuplicate) {
      bucket.possible.push(prepared);
    } else {
      bucket.reports.push(prepared);
    }
    byIssue.set(row.issueId, bucket);
  }

  const campaignReportCount = ordered.length;
  const issues: Issue[] = [];
  for (const [issueId, bucket] of byIssue) {
    if (bucket.reports.length === 0) continue;
    issues.push(
      rebuildIssue(
        issueId,
        bucket.reports,
        bucket.possible,
        campaignReportCount,
      ),
    );
  }

  // Oldest first, matching the order the fold built them in.
  issues.sort((a, b) => a.reports[0].createdAt - b.reports[0].createdAt);

  return { issues, noise };
}

async function existingOutcome(
  campaignId: string,
  clientReportId: string,
): Promise<IngestOutcome | null> {
  const existing = await db.report.findUnique({
    where: { campaignId_clientReportId: { campaignId, clientReportId } },
    select: {
      id: true,
      issueId: true,
      isNoise: true,
      isPossibleDuplicate: true,
      issue: { select: { title: true, occurrenceCount: true } },
    },
  });
  if (existing === null) return null;

  const decision: Decision["kind"] = existing.isNoise
    ? "noise"
    : existing.isPossibleDuplicate
      ? "possible"
      : existing.issueId === null
        ? "new"
        : "attach";

  return {
    reportId: existing.id,
    decision,
    issueId: existing.issueId,
    issueTitle: existing.issue?.title ?? null,
    occurrenceCount: existing.issue?.occurrenceCount ?? null,
    deduplicated: true,
  };
}

export async function ingestReport(input: IngestInput): Promise<IngestOutcome> {
  const campaign = await db.campaign.findUnique({
    where: { id: input.campaignId },
    select: { status: true, revokedAt: true },
  });

  if (
    campaign === null ||
    campaign.status !== "OPEN" ||
    campaign.revokedAt !== null
  ) {
    throw new CampaignNotOpenError(input.campaignId);
  }

  // The overlay retries with backoff (§7), so the same report can arrive
  // twice. Recognising it here is what stops a retry inflating an occurrence
  // count -- the number the board sorts on and pays rewards against.
  if (input.clientReportId !== undefined) {
    const already = await existingOutcome(
      input.campaignId,
      input.clientReportId,
    );
    if (already !== null) return already;
  }

  const [rows, storedIssues] = await Promise.all([
    db.report.findMany({ where: { campaignId: input.campaignId } }),
    db.issue.findMany({
      where: { campaignId: input.campaignId },
      select: { id: true, severity: true, occurrenceCount: true },
    }),
  ]);

  const reportId = randomUUID();
  const incoming: IncomingReport = {
    id: reportId,
    reporterId: input.reporterId,
    body: input.body,
    gameState: input.gameState,
    systemInfo: input.systemInfo,
    consoleTail: input.consoleTail,
    createdAt: Date.now(),
  };

  const result = ingest(toTriageState(rows), incoming);
  const decision = result.decision;

  const issueId =
    decision.kind === "attach" || decision.kind === "possible"
      ? decision.issueId
      : decision.kind === "new"
        ? `issue_${reportId}`
        : null;

  const issue =
    issueId === null
      ? null
      : (result.state.issues.find((candidate) => candidate.id === issueId) ??
        null);

  await db.$transaction(async (tx) => {
    if (decision.kind === "new" && issue !== null) {
      // The issue id is the domain's own, derived from its first report, so
      // reloading the campaign reconstructs exactly the same state.
      await tx.issue.create({
        data: {
          id: issue.id,
          campaignId: input.campaignId,
          title: issue.title,
          category: issue.category,
          severity: issue.severity,
          firstReporterId: issue.firstReporterId,
          occurrenceCount: issue.reports.length,
          signature: issue.signature,
          sharedTraits: sharedTraitsOf(issue),
        },
      });
    }

    await tx.report.create({
      data: {
        id: reportId,
        campaignId: input.campaignId,
        reporterId: input.reporterId,
        body: input.body,
        screenshotData: input.screenshotData ?? null,
        gameState: input.gameState as unknown as Prisma.InputJsonValue,
        systemInfo: input.systemInfo as unknown as Prisma.InputJsonValue,
        consoleTail: [...input.consoleTail],
        signature: result.report.signature,
        tokens: [...result.report.tokens],
        normalisedBody: result.report.normalisedBody,
        isNoise: result.report.isNoise,
        isPossibleDuplicate: decision.kind === "possible",
        issueId,
        clientReportId: input.clientReportId ?? null,
        createdAt: new Date(incoming.createdAt),
      },
    });

    if (decision.kind === "attach" && issue !== null) {
      await tx.issue.update({
        where: { id: issue.id },
        data: {
          category: issue.category,
          severity: issue.severity,
          occurrenceCount: issue.reports.length,
          signature: issue.signature,
          sharedTraits: sharedTraitsOf(issue),
          // title is deliberately not rewritten. It belongs to the first
          // reporter, and the optional LLM pass may already have improved it.
        },
      });
    }

    // Severity is a share of the campaign, so every issue moves when the
    // campaign grows -- not only the one that just gained a report.
    const stored = new Map(storedIssues.map((row) => [row.id, row.severity]));
    for (const candidate of result.state.issues) {
      if (candidate.id === issueId && decision.kind !== "possible") continue;
      if (stored.get(candidate.id) === candidate.severity) continue;
      await tx.issue.update({
        where: { id: candidate.id },
        data: { severity: candidate.severity },
      });
    }
  });

  campaignEvents.emit({
    type: "report_ingested",
    payload: {
      reportId,
      campaignId: input.campaignId,
      body: input.body,
      scene: input.gameState.scene,
      isNoise: result.report.isNoise,
      issueId,
      issueTitle: issue?.title ?? null,
      createdAt: incoming.createdAt,
    },
  });

  if (issue !== null) {
    campaignEvents.emit({
      type: decision.kind === "new" ? "issue_created" : "issue_updated",
      payload: {
        campaignId: input.campaignId,
        issueId: issue.id,
        title: issue.title,
        category: issue.category,
        severity: issue.severity,
        occurrenceCount: issue.reports.length,
        status: "OPEN",
      },
    });
  }

  return {
    reportId,
    decision: decision.kind,
    issueId,
    issueTitle: issue?.title ?? null,
    occurrenceCount: issue === null ? null : issue.reports.length,
    deduplicated: false,
  };
}
