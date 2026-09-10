import type { BoardIssue } from "@/components/IssueBoard";
import type { IssueCategory, Severity } from "@/domain/triage/types";

/**
 * Shapes a stored issue row into the row the board renders.
 *
 * V2 §5.2 asks the second line for platform, scene and age. None of that
 * was plumbed before; all of it is already on the row — the OS tally and
 * scene live in sharedTraits (see sharedTraitsOf in server/reportMapping),
 * and the age comes from createdAt. Pure, so the server component and the
 * client's poll refresh can share one mapping instead of drifting.
 */

export interface IssueRowSource {
  readonly id: string;
  readonly title: string;
  readonly category: IssueCategory;
  readonly severity: Severity;
  readonly status: string;
  readonly occurrenceCount: number;
  readonly sharedTraits?: unknown;
  readonly createdAt?: string | number | Date | null;
}

interface SharedTraitsShape {
  readonly os?: Record<string, number>;
  readonly scene?: string;
}

/** The OS family the most reports came from, or null when it is a tie of one. */
export function dominantPlatform(traits: unknown): string | null {
  const os = (traits as SharedTraitsShape | null)?.os;
  if (!os) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of Object.entries(os)) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  // "Other" is what the family matcher returns when it recognised nothing.
  // Printing it on the board would be noise pretending to be a fact.
  return best === "Other" ? null : best;
}

export function toBoardIssue(row: IssueRowSource): BoardIssue {
  const scene = (row.sharedTraits as SharedTraitsShape | null)?.scene ?? null;
  const createdAt =
    row.createdAt == null ? null : new Date(row.createdAt).getTime();

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    severity: row.severity,
    status: row.status,
    occurrenceCount: row.occurrenceCount,
    platform: dominantPlatform(row.sharedTraits),
    scene,
    firstSeenAt: Number.isFinite(createdAt) ? createdAt : null,
  };
}
