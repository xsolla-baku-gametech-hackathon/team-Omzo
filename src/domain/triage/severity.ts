import { PROGRESSION_KEYWORDS, SEVERITY_THRESHOLDS } from "./config";
import type { IssueCategory, Severity } from "./types";

/**
 * Pure rules, no model (SPEC.md §5.5). Recomputed on every attach, so an
 * issue escalates as occurrences accumulate rather than being frozen at
 * whatever the first reporter happened to write.
 */

export function blocksProgression(normalisedBody: string): boolean {
  return PROGRESSION_KEYWORDS.some((keyword) =>
    normalisedBody.includes(keyword),
  );
}

export function severityFor(input: {
  readonly category: IssueCategory;
  readonly occurrenceCount: number;
  /** Every occurrence's normalised body. One blocker is enough to escalate. */
  readonly normalisedBodies: readonly string[];
}): Severity {
  const { category, occurrenceCount, normalisedBodies } = input;

  if (category === "CRASH" || occurrenceCount >= SEVERITY_THRESHOLDS.critical) {
    return "CRITICAL";
  }
  if (
    occurrenceCount >= SEVERITY_THRESHOLDS.high ||
    normalisedBodies.some(blocksProgression)
  ) {
    return "HIGH";
  }
  if (occurrenceCount >= SEVERITY_THRESHOLDS.medium) return "MEDIUM";
  return "LOW";
}
