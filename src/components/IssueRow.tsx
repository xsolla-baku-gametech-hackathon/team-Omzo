import Link from "next/link";

import type { IssueCategory, Severity } from "@/domain/triage/types";

/**
 * One issue on the board.
 *
 * A full-width row, not a card (SPEC.md §8): severity as a 3px left rule, the
 * title, the category as plain text, and the occurrence count set large on
 * the right. The count is the number a developer scans down the column for,
 * so it gets the display size and nothing else competes with it.
 *
 * Every colour comes from tokens.css. The vermilion belongs to CRITICAL and
 * the teal to verified, and neither appears anywhere else -- that restraint is
 * what makes the board readable at a glance rather than decorated.
 */

export interface IssueRowProps {
  readonly id: string;
  readonly campaignId: string;
  readonly title: string;
  readonly category: IssueCategory;
  readonly severity: Severity;
  readonly occurrenceCount: number;
  readonly status: string;
  /** Reports held for one-click confirm/split, not counted as occurrences. */
  readonly possibleDuplicateCount?: number;
  readonly isSelected?: boolean;
}

const SEVERITY_RULE: Record<Severity, string> = {
  CRITICAL: "border-l-sev-critical",
  HIGH: "border-l-sev-high",
  MEDIUM: "border-l-sev-medium",
  LOW: "border-l-sev-low",
};

/** Sentence case, not caps. §8: no all-caps labels, anywhere. */
const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  CRASH: "Crash",
  VISUAL: "Visual",
  GAMEPLAY: "Gameplay",
  PERFORMANCE: "Performance",
  AUDIO: "Audio",
  UX: "Interface",
};

export function IssueRow({
  id,
  campaignId,
  title,
  category,
  severity,
  occurrenceCount,
  status,
  possibleDuplicateCount = 0,
  isSelected = false,
}: IssueRowProps) {
  const isVerified = status === "VERIFIED";

  return (
    <Link
      href={`/studio/${campaignId}/issues/${id}`}
      data-testid="issue-row"
      data-severity={severity}
      data-issue-id={id}
      className={[
        "flex items-start justify-between gap-4 border-b border-hairline",
        "border-l-[3px] px-4 py-3.5 transition-colors",
        SEVERITY_RULE[severity],
        isSelected ? "bg-raised" : "bg-paper hover:bg-raised",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-x-2 text-label text-slate">
          <span
            data-testid="issue-severity-label"
            className={severity === "CRITICAL" ? "text-critical" : undefined}
          >
            {SEVERITY_LABEL[severity]}
          </span>
          <span aria-hidden="true">·</span>
          <span data-testid="issue-category-label">
            {CATEGORY_LABEL[category]}
          </span>
          {isVerified && (
            <>
              <span aria-hidden="true">·</span>
              <span
                data-testid="issue-verified-badge"
                className="text-verified"
              >
                Verified
              </span>
            </>
          )}
        </div>

        <p className="text-label-lg text-ink">{title}</p>

        {possibleDuplicateCount > 0 && (
          <p
            data-testid="issue-possible-count"
            className="mt-1 text-label text-slate"
          >
            {possibleDuplicateCount} possible{" "}
            {possibleDuplicateCount === 1 ? "duplicate" : "duplicates"} to
            confirm
          </p>
        )}
      </div>

      <span
        data-testid="issue-occurrence-count"
        className="text-figure shrink-0 tabular-nums text-ink"
      >
        {occurrenceCount}
      </span>
    </Link>
  );
}
