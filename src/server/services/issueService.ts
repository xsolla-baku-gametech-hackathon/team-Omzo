import { describeSharedTraits } from "@/domain/triage/describe";
import type { SharedTraits } from "@/domain/triage/describe";
import type { GameState, SystemInfo } from "@/domain/triage/types";
import { rebuildIssue } from "@/domain/triage/cluster";
import { db } from "@/server/db";
import { sharedTraitsOf, toPreparedReport } from "@/server/reportMapping";
import { payVerificationReward } from "@/server/services/rewardService";
import { campaignEvents } from "@/server/events";
import type { Issue, Prisma, Report, Severity } from "@prisma/client";

/**
 * Issue queries and shared-traits synthesis (SPEC.md §5.5, §8).
 *
 * Rules:
 * - Sort order: severity (CRITICAL > HIGH > MEDIUM > LOW) then occurrenceCount desc
 * - Shared traits stated as a sentence, not a chart:
 *   "16 of 18 occurrences on AMD GPUs. 17 of 18 in Chrome. All within 4 units of (128, 0, 96)."
 */

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export type SynthesizedTraits = SharedTraits;

/**
 * Re-exported so callers keep one import. The synthesis itself lives in
 * domain/triage/describe.ts: it is pure, it belongs beside the classifiers it
 * uses, and it had been reimplemented here -- a second copy of "which GPU
 * family is this" that already disagreed with the clusterer's about whether
 * Edge counts as Chrome.
 */
export { describeSharedTraits };

export interface IssueWithReports extends Issue {
  readonly reports: readonly Report[];
  readonly synthesizedTraits: SynthesizedTraits;
}

export class IssueNotFoundError extends Error {
  constructor(issueId: string) {
    super(`Issue ${issueId} was not found.`);
    this.name = "IssueNotFoundError";
  }
}

export class UnauthorizedIssueMutationError extends Error {
  constructor() {
    super("You do not have permission to verify or modify this issue.");
    this.name = "UnauthorizedIssueMutationError";
  }
}

/**
 * Fetches all issues for a campaign, sorted by severity then occurrenceCount desc.
 */
export async function getCampaignIssues(
  campaignId: string,
): Promise<readonly Issue[]> {
  const issues = await db.issue.findMany({
    where: { campaignId },
  });

  return [...issues].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.occurrenceCount - a.occurrenceCount;
  });
}

/**
 * Everything the board needs, for a studio that is allowed to see it.
 *
 * The ownership check lives here rather than only in the route, because a
 * second caller of the same data would otherwise have to remember to repeat
 * it -- and §6.5 puts authorisation in the service layer for exactly that
 * reason.
 */
export async function getBoardForStudio(
  campaignId: string,
  studioId: string | undefined,
): Promise<{
  issues: readonly Issue[];
  reports: readonly Report[];
  stats: { totalReports: number; totalIssues: number; noiseCount: number };
}> {
  if (studioId === undefined || studioId === "") {
    throw new UnauthorizedIssueMutationError();
  }

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { studioId: true },
  });

  if (campaign === null) {
    throw new IssueNotFoundError(campaignId);
  }
  if (campaign.studioId !== studioId) {
    throw new UnauthorizedIssueMutationError();
  }

  const [issues, reports, totalReports, noiseCount] = await Promise.all([
    getCampaignIssues(campaignId),
    getCampaignReportsStream(campaignId, 50),
    db.report.count({ where: { campaignId } }),
    db.report.count({ where: { campaignId, isNoise: true } }),
  ]);

  return {
    issues,
    reports,
    stats: { totalReports, totalIssues: issues.length, noiseCount },
  };
}

/**
 * Fetches the recent raw incoming reports stream for a campaign.
 */
export async function getCampaignReportsStream(
  campaignId: string,
  limit: number = 40,
): Promise<readonly Report[]> {
  return db.report.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Fetches single issue detail, attached occurrences, and screenshots.
 */
export async function getIssueDetail(
  issueId: string,
  studioId: string | undefined,
): Promise<IssueWithReports> {
  if (studioId === undefined || studioId === "") {
    throw new UnauthorizedIssueMutationError();
  }

  const issue = await db.issue.findUnique({
    where: { id: issueId },
    include: {
      campaign: { select: { studioId: true } },
      reports: {
        orderBy: { createdAt: "desc" },
        include: {
          reporter: { select: { displayName: true } },
        },
      },
    },
  });

  if (issue === null) {
    throw new IssueNotFoundError(issueId);
  }
  if (issue.campaign.studioId !== studioId) {
    throw new UnauthorizedIssueMutationError();
  }

  // Only the counted occurrences. A possible duplicate is not part of this
  // issue until a human says so, and a sentence that described 71 reports
  // under a heading reading 58 would be quietly describing a different set.
  const synthesizedTraits = describeSharedTraits(
    issue.reports
      .filter((report) => !report.isPossibleDuplicate)
      .map((report) => ({
        systemInfo: report.systemInfo as unknown as SystemInfo,
        gameState: report.gameState as unknown as GameState,
      })),
  );

  return {
    ...issue,
    synthesizedTraits,
  };
}

/**
 * Verifies an issue, marking status = VERIFIED and emitting realtime events.
 *
 * `studioId` is required, not optional. It was optional, and the route passed
 * `session?.studioId` -- so a caller with no session at all passed `undefined`
 * and the ownership check was skipped entirely, letting anyone verify any
 * issue in any campaign. Verification is what releases a payout from the
 * studio's reward pool (§6.4), so this is the one mutation that must never
 * take "no caller" for an answer.
 */
export async function verifyIssue(
  issueId: string,
  studioId: string,
): Promise<Issue> {
  if (studioId === "") {
    throw new UnauthorizedIssueMutationError();
  }

  const issue = await db.issue.findUnique({
    where: { id: issueId },
    include: { campaign: { select: { studioId: true } } },
  });

  if (issue === null) {
    throw new IssueNotFoundError(issueId);
  }

  if (issue.campaign.studioId !== studioId) {
    throw new UnauthorizedIssueMutationError();
  }

  const updated = await db.issue.update({
    where: { id: issueId },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date(),
    },
  });

  // Pays the first reporter, once, however many times this is called. The
  // reward is deliberately not inside the status update: an issue that is
  // verified but whose payout failed is recoverable by verifying again, while
  // a payout that succeeded against a status change that rolled back is not.
  await payVerificationReward(updated.id);

  campaignEvents.emit({
    type: "issue_verified",
    payload: {
      campaignId: updated.campaignId,
      issueId: updated.id,
      verifiedAt: updated.verifiedAt
        ? updated.verifiedAt.toISOString()
        : new Date().toISOString(),
    },
  });

  campaignEvents.emit({
    type: "issue_updated",
    payload: {
      campaignId: updated.campaignId,
      issueId: updated.id,
      title: updated.title,
      category: updated.category,
      severity: updated.severity,
      occurrenceCount: updated.occurrenceCount,
      status: updated.status,
    },
  });

  return updated;
}

/**
 * Rewrites every derived column on an issue from the reports that justify it.
 *
 * The issue table is a materialised view of its reports, so anything that
 * changes which reports belong to it has to run this or the board starts
 * showing a count that no longer matches what is underneath.
 */
async function persistRebuild(
  tx: Prisma.TransactionClient,
  issueId: string,
  campaignId: string,
): Promise<void> {
  const [rows, campaignReportCount] = await Promise.all([
    tx.report.findMany({ where: { issueId } }),
    tx.report.count({ where: { campaignId } }),
  ]);

  const counted = rows
    .filter((row) => !row.isPossibleDuplicate && !row.isNoise)
    .map(toPreparedReport)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (counted.length === 0) {
    await tx.issue.delete({ where: { id: issueId } });
    return;
  }

  const rebuilt = rebuildIssue(issueId, counted, [], campaignReportCount);

  await tx.issue.update({
    where: { id: issueId },
    data: {
      category: rebuilt.category,
      severity: rebuilt.severity,
      occurrenceCount: rebuilt.reports.length,
      signature: rebuilt.signature,
      sharedTraits: sharedTraitsOf(rebuilt),
    },
  });
}

async function ownedReport(
  reportId: string,
  studioId: string | undefined,
): Promise<{ id: string; campaignId: string; issueId: string }> {
  if (studioId === undefined || studioId === "") {
    throw new UnauthorizedIssueMutationError();
  }

  const report = await db.report.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      campaignId: true,
      issueId: true,
      isPossibleDuplicate: true,
      campaign: { select: { studioId: true } },
    },
  });

  if (report === null || report.issueId === null) {
    throw new IssueNotFoundError(reportId);
  }
  if (report.campaign.studioId !== studioId) {
    throw new UnauthorizedIssueMutationError();
  }
  if (!report.isPossibleDuplicate) {
    throw new IssueNotFoundError(reportId);
  }

  return {
    id: report.id,
    campaignId: report.campaignId,
    issueId: report.issueId,
  };
}

/**
 * Confirm: the borderline report really is this issue.
 *
 * The engine declined to decide, so a human did. That is the whole design --
 * a wrongly merged report hides a real bug, so the band exists to hand the
 * call to someone who can open both and look.
 */
export async function confirmDuplicate(
  reportId: string,
  studioId: string | undefined,
): Promise<{ issueId: string; occurrenceCount: number }> {
  const report = await ownedReport(reportId, studioId);

  await db.$transaction(async (tx) => {
    await tx.report.update({
      where: { id: report.id },
      data: { isPossibleDuplicate: false },
    });
    await persistRebuild(tx, report.issueId, report.campaignId);
  });

  const issue = await db.issue.findUnique({
    where: { id: report.issueId },
    select: { occurrenceCount: true },
  });

  campaignEvents.emit({
    type: "issue_updated",
    payload: {
      campaignId: report.campaignId,
      issueId: report.issueId,
      title: "",
      category: "",
      severity: "",
      occurrenceCount: issue?.occurrenceCount ?? 0,
      status: "OPEN",
    },
  });

  return {
    issueId: report.issueId,
    occurrenceCount: issue?.occurrenceCount ?? 0,
  };
}

/**
 * Split: it is its own bug, and becomes its own issue.
 *
 * The new issue is built by the same domain function that builds every other
 * one, so a split issue is indistinguishable from one clustering opened
 * itself -- there is no second kind of issue to reason about.
 */
export async function splitDuplicate(
  reportId: string,
  studioId: string | undefined,
): Promise<{ issueId: string }> {
  const report = await ownedReport(reportId, studioId);
  const newIssueId = `issue_${report.id}`;

  await db.$transaction(async (tx) => {
    const row = await tx.report.findUniqueOrThrow({ where: { id: report.id } });
    const campaignReportCount = await tx.report.count({
      where: { campaignId: report.campaignId },
    });

    const built = rebuildIssue(
      newIssueId,
      [toPreparedReport(row)],
      [],
      campaignReportCount,
    );

    await tx.issue.create({
      data: {
        id: newIssueId,
        campaignId: report.campaignId,
        title: built.title,
        category: built.category,
        severity: built.severity,
        firstReporterId: built.firstReporterId,
        occurrenceCount: 1,
        signature: built.signature,
        sharedTraits: sharedTraitsOf(built),
      },
    });

    await tx.report.update({
      where: { id: report.id },
      data: { issueId: newIssueId, isPossibleDuplicate: false },
    });

    await persistRebuild(tx, report.issueId, report.campaignId);
  });

  campaignEvents.emit({
    type: "issue_created",
    payload: {
      campaignId: report.campaignId,
      issueId: newIssueId,
      title: "",
      category: "",
      severity: "",
      occurrenceCount: 1,
      status: "OPEN",
    },
  });

  return { issueId: newIssueId };
}
