import { categorise } from "./category";
import { isNoise } from "./noise";
import { tokenise, normalise } from "./normalise";
import { logSignature } from "./signature";
import { severityFor } from "./severity";
import { decide, scoreAgainst } from "./similarity";
import type { IssueProfile, ScoredIssue, Thresholds } from "./similarity";
import { DEFAULT_THRESHOLDS } from "./similarity";
import { modalBucket, modalScene } from "./state";
import { buildCorpus, centroid, vectorise } from "./tfidf";
import type { Vector } from "./tfidf";
import { tallyEnvironment } from "./traits";
import type {
  Decision,
  IncomingReport,
  Issue,
  IssueCategory,
  PreparedReport,
} from "./types";

/**
 * The clustering fold.
 *
 * Reports arrive one at a time in production, so this is written as a fold and
 * not as a batch clusterer: ingestService will call `ingest` with the issues
 * it loaded from the database and persist the result. Running the same
 * function over an array is then just a fold, which is what the fixture test
 * does -- the test exercises the real code path rather than a batch cousin of
 * it that could drift.
 */

export interface TriageState {
  readonly issues: readonly Issue[];
  /** Set aside, never deleted. The studio can audit what was filtered. */
  readonly noise: readonly PreparedReport[];
}

export interface IngestResult {
  readonly state: TriageState;
  readonly report: PreparedReport;
  readonly decision: Decision;
}

export const emptyState: TriageState = { issues: [], noise: [] };

/** Truncated first sentence. The LLM may replace it; it is never required to. */
function fallbackTitle(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length <= 70 ? trimmed : `${trimmed.slice(0, 69)}…`;
}

function allReports(state: TriageState): PreparedReport[] {
  return state.issues.flatMap((issue) => issue.reports);
}

/**
 * Every report the campaign has received, including the ones held as possible
 * duplicates and the ones set aside as noise. Severity is a share of this, and
 * a tester whose report was filtered still filed it.
 */
function campaignSize(state: TriageState): number {
  return (
    state.noise.length +
    state.issues.reduce(
      (total, issue) =>
        total + issue.reports.length + issue.possibleDuplicates.length,
      0,
    )
  );
}

/**
 * Severity is a share of the campaign, so every issue's severity moves when
 * the campaign grows -- not only the one that just gained a report. Left
 * unrecomputed, an issue that opened at 6% of a young campaign would still
 * read CRITICAL after four hundred more reports made it 1%.
 */
function recomputeSeverities(
  issues: readonly Issue[],
  campaignReportCount: number,
): Issue[] {
  return issues.map((issue) => ({
    ...issue,
    severity: severityFor({
      category: issue.category,
      occurrenceCount: issue.reports.length,
      campaignReportCount,
      normalisedBodies: issue.reports.map((report) => report.normalisedBody),
    }),
  }));
}

function prepare(incoming: IncomingReport, state: TriageState): PreparedReport {
  const normalisedBody = normalise(incoming.body);
  const tokens = tokenise(incoming.body);
  const signature = logSignature(incoming.consoleTail);

  const priorFromSameReporter = [...allReports(state), ...state.noise]
    .filter((report) => report.reporterId === incoming.reporterId)
    .map((report) => ({ body: report.body, createdAt: report.createdAt }));

  return {
    ...incoming,
    normalisedBody,
    tokens,
    signature,
    category: categorise(tokens),
    isNoise: isNoise({
      body: incoming.body,
      normalisedBody,
      tokens,
      signature,
      scene: incoming.gameState.scene,
      createdAt: incoming.createdAt,
      priorFromSameReporter,
    }),
  };
}

/** Ties break by this order, so an issue's category never depends on arrival. */
const CATEGORY_PRIORITY: readonly IssueCategory[] = [
  "CRASH",
  "PERFORMANCE",
  "AUDIO",
  "VISUAL",
  "UX",
  "GAMEPLAY",
];

function modalCategory(reports: readonly PreparedReport[]): IssueCategory {
  const counts = new Map<IssueCategory, number>();
  for (const report of reports) {
    counts.set(report.category, (counts.get(report.category) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    (a, b) =>
      b[1] - a[1] ||
      CATEGORY_PRIORITY.indexOf(a[0]) - CATEGORY_PRIORITY.indexOf(b[0]),
  )[0][0];
}

/** The most common non-empty signature, or "" if no occurrence produced one. */
function modalSignature(reports: readonly PreparedReport[]): string {
  const counts = new Map<string, number>();
  for (const report of reports) {
    if (report.signature === "") continue;
    counts.set(report.signature, (counts.get(report.signature) ?? 0) + 1);
  }
  if (counts.size === 0) return "";
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0][0];
}

/**
 * Rebuilds every derived field from the issue's occurrences. Called on create
 * and on every attach, so nothing can drift out of step with the reports that
 * justify it.
 *
 * Exported because the server reconstructs issues from database rows with it
 * too. Every column on the Issue table is a materialised view of its reports,
 * so rebuilding through this one function means stored state cannot drift
 * into something clustering would never have produced.
 */
export function rebuildIssue(
  id: string,
  reports: readonly PreparedReport[],
  possibleDuplicates: readonly PreparedReport[],
  campaignReportCount: number,
): Issue {
  const first = reports[0];
  const category = modalCategory(reports);
  const states = reports.map((report) => report.gameState);

  return {
    id,
    category,
    severity: severityFor({
      category,
      occurrenceCount: reports.length,
      campaignReportCount,
      normalisedBodies: reports.map((report) => report.normalisedBody),
    }),
    firstReporterId: first.reporterId,
    title: fallbackTitle(first.body),
    reports,
    possibleDuplicates,
    signature: modalSignature(reports),
    scene: modalScene(states),
    bucket: modalBucket(states),
    environment: tallyEnvironment(reports.map((report) => report.systemInfo)),
  };
}

function profileOf(
  issue: Issue,
  vectorFor: (report: PreparedReport) => Vector,
): IssueProfile {
  return {
    id: issue.id,
    centroid: centroid(issue.reports.map(vectorFor)),
    scene: issue.scene,
    bucket: issue.bucket,
    signature: issue.signature,
    occurrences: issue.reports.length,
    environment: issue.environment,
  };
}

/**
 * One report against the current state.
 *
 * IDF is rebuilt here, per campaign, on every ingest (SPEC.md §5.2 A). At a
 * few hundred reports that is sub-millisecond, and it is what lets the engine
 * persist no vocabulary and no centroid.
 */
export function ingest(
  state: TriageState,
  incoming: IncomingReport,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): IngestResult {
  const report = prepare(incoming, state);

  if (report.isNoise) {
    return {
      state: { ...state, noise: [...state.noise, report] },
      report,
      decision: { kind: "noise" },
    };
  }

  const existing = allReports(state);
  const corpus = buildCorpus([...existing.map((r) => r.tokens), report.tokens]);

  const vectors = new Map<string, Vector>();
  for (const r of existing) vectors.set(r.id, vectorise(r.tokens, corpus));
  const vectorFor = (r: PreparedReport): Vector =>
    vectors.get(r.id) ?? vectorise(r.tokens, corpus);

  const reportVector = vectorise(report.tokens, corpus);

  const scored: ScoredIssue[] = state.issues.map((issue) => ({
    issueId: issue.id,
    score: scoreAgainst(report, reportVector, profileOf(issue, vectorFor)),
  }));

  const decision = decide(scored, thresholds);

  const campaignReportCount = campaignSize(state) + 1;

  const issues = state.issues.map((issue) => {
    if (decision.kind === "attach" && decision.issueId === issue.id) {
      return rebuildIssue(
        issue.id,
        [...issue.reports, report],
        issue.possibleDuplicates,
        campaignReportCount,
      );
    }
    if (decision.kind === "possible" && decision.issueId === issue.id) {
      return rebuildIssue(
        issue.id,
        issue.reports,
        [...issue.possibleDuplicates, report],
        campaignReportCount,
      );
    }
    return issue;
  });

  if (decision.kind === "new") {
    issues.push(
      rebuildIssue(`issue:${report.id}`, [report], [], campaignReportCount),
    );
  }

  return {
    state: {
      ...state,
      issues: recomputeSeverities(issues, campaignReportCount),
    },
    report,
    decision,
  };
}

/** Fold a batch through the same path a live report takes. */
export function triageAll(
  reports: readonly IncomingReport[],
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): TriageState {
  return reports.reduce<TriageState>(
    (state, report) => ingest(state, report, thresholds).state,
    emptyState,
  );
}
