import Link from "next/link";

import type { IssueCategory, Severity } from "@/domain/triage/types";

/**
 * IssueRow — UI_SPEC.md §3.2, §4
 *
 * Full-width row (72px target height), 3px left rule for severity,
 * title at --type-heading, secondary metadata at --type-meta,
 * category as plain text, occurrence count right-aligned in tabular font.
 *
 * Hover raises the row background to --surface-raised only.
 * "N similar issues — review" text link rendered in --accent.
 */

export interface IssueRowProps {
  readonly id: string;
  readonly campaignId: string;
  readonly title: string;
  readonly category: IssueCategory;
  readonly severity: Severity;
  readonly occurrenceCount: number;
  readonly status: string;
  /** Reports or similar issues held for review in the 0.25–0.40 band. */
  readonly possibleDuplicateCount?: number;
  readonly isSelected?: boolean;
}

const SEVERITY_RULE: Record<Severity, string> = {
  CRITICAL: "border-l-sev-critical",
  HIGH: "border-l-sev-high",
  MEDIUM: "border-l-sev-medium",
  LOW: "border-l-sev-low",
};

/** Sentence case, not all-caps. */
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
        "flex items-center justify-between gap-4 border-b border-[var(--color-line-hairline)]",
        "border-l-[3px] px-4 py-3 min-h-[72px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]",
        SEVERITY_RULE[severity],
        isSelected
          ? "bg-[var(--color-surface-raised)]"
          : "bg-[var(--color-surface-page)] hover:bg-[var(--color-surface-raised)]",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-0.5">
          {/* Main line: Title + Category */}
          <div className="flex items-baseline gap-2">
            <span className="text-[16px] md:text-[18px] font-[550] leading-[1.35] tracking-[-0.01em] text-[var(--color-ink-primary)] truncate">
              {title}
            </span>
            <span
              data-testid="issue-category-label"
              className="text-[13px] font-[450] text-[var(--color-ink-secondary)] shrink-0 hidden sm:inline"
            >
              {CATEGORY_LABEL[category]}
            </span>
          </div>

          {/* Subline: Metadata + Similar issues review */}
          <div className="flex flex-wrap items-center gap-x-2 text-[13px] font-[450] text-[var(--color-ink-secondary)] leading-[1.4]">
            <span
              data-testid="issue-severity-label"
              className={severity === "CRITICAL" ? "text-critical" : undefined}
            >
              {SEVERITY_LABEL[severity]}
            </span>
            <span aria-hidden="true" className="text-hairline">·</span>
            <span className="sm:hidden">{CATEGORY_LABEL[category]}</span>
            <span aria-hidden="true" className="sm:hidden text-hairline">·</span>
            {isVerified && (
              <>
                <span
                  data-testid="issue-verified-badge"
                  className="text-verified font-medium"
                >
                  Verified
                </span>
                <span aria-hidden="true" className="text-hairline">·</span>
              </>
            )}

            {possibleDuplicateCount > 0 && (
              <span
                data-testid="issue-possible-count"
                className="text-verified font-medium hover:underline"
              >
                {possibleDuplicateCount}{" "}
                {possibleDuplicateCount === 1
                  ? "possible duplicate to review"
                  : "possible duplicates to review"}
              </span>
            )}
          </div>
        </div>
      </div>

      <span
        data-testid="issue-occurrence-count"
        className="text-[18px] md:text-[22px] font-[600] shrink-0 tabular-nums text-[var(--color-ink-primary)] tracking-[-0.02em] text-right pl-2"
      >
        {occurrenceCount}
      </span>
    </Link>
  );
}
