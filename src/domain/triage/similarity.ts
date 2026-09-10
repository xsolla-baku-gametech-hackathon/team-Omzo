import {
  SIGNATURE_MATCH_FLOOR,
  STATE_SCORES,
  THRESHOLD_ATTACH,
  THRESHOLD_POSSIBLE,
  WEIGHTS,
} from "./config";
import { stateScore } from "./state";
import type { Vector } from "./tfidf";
import { cosine } from "./tfidf";
import { environmentScore } from "./traits";
import type {
  Bucket,
  Decision,
  EnvironmentTally,
  PreparedReport,
  ScoreBreakdown,
} from "./types";

/**
 * WHEN IN DOUBT, DO NOT MERGE.
 *
 * The thresholds below are not symmetric and are not meant to be. A wrongly
 * merged report hides a real bug: it disappears into someone else's issue,
 * the occurrence count is a lie, and nobody ever looks at it again. A wrongly
 * split one costs a developer one click.
 *
 * So the attach threshold sits high, the band beneath it hands the decision
 * to a human instead of guessing, and every rule that could push a borderline
 * pair either way pushes it towards "separate". If you are tuning these
 * numbers and the two errors look equally bad, they are not.
 */

/** Everything triage needs to know about an existing issue to score against it. */
export interface IssueProfile {
  readonly id: string;
  readonly centroid: Vector;
  readonly scene: string;
  readonly bucket: Bucket;
  /** "" when no occurrence produced an error line. */
  readonly signature: string;
  readonly occurrences: number;
  readonly environment: EnvironmentTally;
}

export function scoreAgainst(
  report: PreparedReport,
  reportVector: Vector,
  issue: IssueProfile,
): ScoreBreakdown {
  const lexical = cosine(reportVector, issue.centroid);
  const state = stateScore(report.gameState, issue.scene, issue.bucket);

  // Two empty signatures are not a match. Most consoles are clean, so
  // rewarding mutual silence would pull the whole campaign together.
  const signatureComparable = report.signature !== "" && issue.signature !== "";
  const signaturesMatch =
    signatureComparable && report.signature === issue.signature;
  const signature = signaturesMatch ? 1 : 0;

  const environment = environmentScore(
    report.systemInfo,
    issue.environment,
    issue.occurrences,
  );

  // Score over the signals that are actually present, not over all four.
  //
  // An absent signature is not evidence against a merge, and scoring it zero
  // would punish every report with a clean console -- which is most of them.
  // Left unnormalised, a clean-console report tops out at 0.80 against a 0.82
  // threshold: two byte-identical reports from the same spot on the same
  // machine could never attach, and a campaign of 400 reports would produce
  // 400 issues. The weights and thresholds below are exactly as specified;
  // this divides by the weight that was actually in play.
  let weighted =
    WEIGHTS.lexical * lexical +
    WEIGHTS.state * state +
    WEIGHTS.environment * environment;
  let participating = WEIGHTS.lexical + WEIGHTS.state + WEIGHTS.environment;

  if (signatureComparable) {
    weighted += WEIGHTS.signature * signature;
    participating += WEIGHTS.signature;
  }

  // A different scene is a veto, not a low score. "Two reports about
  // different scenes never cluster, however similar the wording" is a product
  // rule, and a product rule should be enforced rather than left to arrive as
  // an arithmetic coincidence that the next retune could quietly undo.
  const sceneVeto = state === STATE_SCORES.differentScene;
  const normalised = sceneVeto ? 0 : weighted / participating;

  // An exact stack match is strong enough to carry a report whose wording
  // shares nothing with the issue -- and strong enough to outrank the scene
  // veto, since the same stack from two scenes is one bug reached two ways.
  // Floored rather than replaced, so a report that also matches on wording
  // and place still outranks one that does not.
  const combined = signaturesMatch
    ? Math.max(normalised, SIGNATURE_MATCH_FLOOR)
    : normalised;

  return {
    lexical,
    state,
    signature,
    environment,
    combined,
    signatureFloorApplied: signaturesMatch && combined > normalised,
  };
}

export interface ScoredIssue {
  readonly issueId: string;
  readonly score: ScoreBreakdown;
}

/**
 * Attach to the single highest scorer, never to several. An occurrence count
 * that double-counts is worse than one that undercounts, because the board
 * sorts on it.
 */
export interface Thresholds {
  readonly attach: number;
  readonly possible: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  attach: THRESHOLD_ATTACH,
  possible: THRESHOLD_POSSIBLE,
};

export function decide(
  scored: readonly ScoredIssue[],
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Decision {
  if (scored.length === 0) return { kind: "new" };

  const best = [...scored].sort(
    (a, b) =>
      b.score.combined - a.score.combined || a.issueId.localeCompare(b.issueId),
  )[0];

  if (best.score.combined >= thresholds.attach) {
    return { kind: "attach", issueId: best.issueId, score: best.score };
  }
  if (best.score.combined >= thresholds.possible) {
    return { kind: "possible", issueId: best.issueId, score: best.score };
  }
  return { kind: "new" };
}
