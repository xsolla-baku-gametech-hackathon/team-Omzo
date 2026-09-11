/**
 * Campaign triage summary — pure aggregates for the studio analytics report.
 *
 * Built from board issue rows already returned by getBoardForStudio, so the
 * report cannot disagree with what the board shows.
 */

import type { IssueCategory, Severity } from "@/domain/triage/types";

export interface AnalyticsIssueRow {
  readonly id: string;
  readonly title: string;
  readonly category: IssueCategory;
  readonly severity: Severity;
  readonly status: string;
  readonly occurrenceCount: number;
}

export interface AnalyticsBoardStats {
  readonly totalReports: number;
  readonly totalIssues: number;
  readonly noiseCount: number;
}

export interface NamedCount {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly percent: number;
}

export interface TopIssueRow {
  readonly id: string;
  readonly title: string;
  readonly category: IssueCategory;
  readonly severity: Severity;
  readonly status: string;
  readonly occurrenceCount: number;
  readonly shareOfReports: number;
}

export interface CampaignAnalyticsSummary {
  readonly totalReports: number;
  readonly totalIssues: number;
  readonly noiseCount: number;
  readonly clusteredReports: number;
  readonly compressionRatio: number;
  readonly byCategory: readonly NamedCount[];
  readonly bySeverity: readonly NamedCount[];
  readonly bySeverityWeighted: readonly NamedCount[];
  readonly byStatus: readonly NamedCount[];
  readonly topIssues: readonly TopIssueRow[];
  readonly headline: string;
}

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  CRASH: "Crash",
  VISUAL: "Visual",
  GAMEPLAY: "Gameplay",
  PERFORMANCE: "Performance",
  AUDIO: "Audio",
  UX: "UX",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const CATEGORY_ORDER: readonly IssueCategory[] = [
  "CRASH",
  "GAMEPLAY",
  "PERFORMANCE",
  "VISUAL",
  "AUDIO",
  "UX",
];

const SEVERITY_ORDER: readonly Severity[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
];

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function toNamedCounts(
  counts: ReadonlyMap<string, number>,
  order: readonly string[],
  labels: Record<string, string>,
  whole: number,
): NamedCount[] {
  return order
    .map((key) => {
      const count = counts.get(key) ?? 0;
      return {
        key,
        label: labels[key] ?? key,
        count,
        percent: percent(count, whole),
      };
    })
    .filter((row) => row.count > 0);
}

export function buildCampaignAnalytics(
  issues: readonly AnalyticsIssueRow[],
  stats: AnalyticsBoardStats,
  topN: number = 8,
): CampaignAnalyticsSummary {
  const categoryCounts = new Map<string, number>();
  const severityCounts = new Map<string, number>();
  const severityWeighted = new Map<string, number>();
  const statusCounts = new Map<string, number>();

  let clusteredReports = 0;
  for (const issue of issues) {
    clusteredReports += issue.occurrenceCount;
    categoryCounts.set(
      issue.category,
      (categoryCounts.get(issue.category) ?? 0) + 1,
    );
    severityCounts.set(
      issue.severity,
      (severityCounts.get(issue.severity) ?? 0) + 1,
    );
    severityWeighted.set(
      issue.severity,
      (severityWeighted.get(issue.severity) ?? 0) + issue.occurrenceCount,
    );
    statusCounts.set(
      issue.status,
      (statusCounts.get(issue.status) ?? 0) + 1,
    );
  }

  const totalIssues = stats.totalIssues;
  const totalReports = stats.totalReports;
  const compressionRatio =
    totalIssues > 0
      ? Math.round((totalReports / totalIssues) * 10) / 10
      : 0;

  const topIssues = [...issues]
    .sort(
      (a, b) =>
        b.occurrenceCount - a.occurrenceCount || a.title.localeCompare(b.title),
    )
    .slice(0, topN)
    .map((issue) => ({
      id: issue.id,
      title: issue.title,
      category: issue.category,
      severity: issue.severity,
      status: issue.status,
      occurrenceCount: issue.occurrenceCount,
      shareOfReports: percent(issue.occurrenceCount, Math.max(clusteredReports, 1)),
    }));

  const top = topIssues[0];
  const headline =
    totalIssues === 0
      ? "No clustered issues yet — reports will collapse here as they arrive."
      : top
        ? `${totalReports} reports collapsed into ${totalIssues} issues (${compressionRatio}× compression). Most common: “${top.title}” (${top.occurrenceCount} occurrences).`
        : `${totalReports} reports collapsed into ${totalIssues} issues.`;

  return {
    totalReports,
    totalIssues,
    noiseCount: stats.noiseCount,
    clusteredReports,
    compressionRatio,
    byCategory: toNamedCounts(
      categoryCounts,
      CATEGORY_ORDER,
      CATEGORY_LABEL,
      totalIssues,
    ),
    bySeverity: toNamedCounts(
      severityCounts,
      SEVERITY_ORDER,
      SEVERITY_LABEL,
      totalIssues,
    ),
    bySeverityWeighted: toNamedCounts(
      severityWeighted,
      SEVERITY_ORDER,
      SEVERITY_LABEL,
      Math.max(clusteredReports, 1),
    ),
    byStatus: toNamedCounts(
      statusCounts,
      ["OPEN", "VERIFIED", "FIXED", "REJECTED"],
      {
        OPEN: "Open",
        VERIFIED: "Verified",
        FIXED: "Fixed",
        REJECTED: "Rejected",
      },
      totalIssues,
    ),
    topIssues,
    headline,
  };
}

export { CATEGORY_LABEL, SEVERITY_LABEL };
