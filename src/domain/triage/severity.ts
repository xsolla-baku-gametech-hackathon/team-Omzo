import {
  PROGRESSION_KEYWORDS,
  SEVERITY_MIN_CAMPAIGN,
  SEVERITY_SHARES,
} from "./config";
import type { IssueCategory, Severity } from "./types";

/**
 * Pure rules, no model (SPEC.md §5.5).
 *
 * Two axes, deliberately. Category and progression keywords say whether there
 * is an impact; share of the campaign says how widespread it is. Neither
 * alone is severity: a lone crash ends someone's session and a cosmetic
 * complaint stays cosmetic however many people mention it.
 *
 * Recomputed on every attach and after every manual merge, so an issue
 * escalates as occurrences accumulate rather than being frozen at whatever
 * the first reporter happened to write.
 */

export function blocksProgression(normalisedBody: string): boolean {
  return PROGRESSION_KEYWORDS.some((keyword) =>
    normalisedBody.includes(keyword),
  );
}

export interface SeverityInput {
  readonly category: IssueCategory;
  readonly occurrenceCount: number;
  /** Every report the campaign has received, not just this issue's. */
  readonly campaignReportCount: number;
  /** Every occurrence's normalised body. One blocker is enough to escalate. */
  readonly normalisedBodies: readonly string[];
}

export function severityFor(input: SeverityInput): Severity {
  const share =
    input.occurrenceCount /
    Math.max(input.campaignReportCount, SEVERITY_MIN_CAMPAIGN);

  const blocking = input.normalisedBodies.some(blocksProgression);

  if (input.category === "CRASH") return "CRITICAL";
  if (blocking && share >= SEVERITY_SHARES.criticalBlocking) return "CRITICAL";
  if (share >= SEVERITY_SHARES.critical) return "CRITICAL";

  if (share >= SEVERITY_SHARES.high) return "HIGH";
  if (blocking) return "HIGH";

  if (share >= SEVERITY_SHARES.medium) return "MEDIUM";
  return "LOW";
}
