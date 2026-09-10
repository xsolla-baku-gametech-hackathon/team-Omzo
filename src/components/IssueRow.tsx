import Link from "next/link";

import { SeverityRule } from "@/components/SeverityRule";
import type { IssueCategory, Severity } from "@/domain/triage/types";

/**
 * IssueRow — UI_SPEC_V2_DARK.md §5.2
 *
 * A 72px full-bleed row. 3px severity rule at the left with no radius,
 * title, a metadata second line, category and count right-aligned, a
 * --line-subtle divider below. No card, no shadow, no radius.
 *
 * Hover raises the background to --surface-raised. Nothing else: no lift,
 * no shadow, no border change, no scale. A developer scanning twenty-three
 * rows for one row does not need the rows to move.
 *
 * The "N similar issues — review" line is the only violet text on the
 * board, which is exactly why it draws the eye — and it should, because it
 * is the one place the board asks the human to decide.
 */

export interface IssueRowProps {
  readonly id: string;
  readonly campaignId: string;
  readonly title: string;
  readonly category: IssueCategory;
  readonly severity: Severity;
  readonly occurrenceCount: number;
  readonly status: string;
  /** Dominant OS family across the issue's reports, e.g. "Windows". */
  readonly platform?: string | null;
  /** The scene the issue is pinned to. Scene veto means there is only one. */
  readonly scene?: string | null;
  /** Epoch ms of first occurrence, for the age. */
  readonly firstSeenAt?: number | null;
  /** Reports or similar issues held for review in the 0.25–0.40 band. */
  readonly possibleDuplicateCount?: number;
  readonly isSelected?: boolean;
}

/** Sentence case, not all-caps (UI_SPEC.md §7). */
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

/** "2h ago", "3d ago". Coarse on purpose — the board is not a log. */
export function formatAge(since: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - since) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function IssueRow({
  id,
  campaignId,
  title,
  category,
  severity,
  occurrenceCount,
  status,
  platform,
  scene,
  firstSeenAt,
  possibleDuplicateCount = 0,
  isSelected = false,
}: IssueRowProps) {
  const isVerified = status === "VERIFIED";

  // Severity leads the second line because UI_SPEC.md §5 forbids conveying
  // it by colour alone, and the 3px rule is the only other carrier.
  const metaParts = [
    SEVERITY_LABEL[severity],
    platform,
    scene,
    firstSeenAt != null ? formatAge(firstSeenAt) : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <Link
      href={`/studio/${campaignId}/issues/${id}`}
      data-testid="issue-row"
      data-severity={severity}
      data-issue-id={id}
      className={[
        "flex items-stretch gap-[var(--space-4)]",
        "min-h-[var(--console-row-h)] pr-[var(--console-row-pad)]",
        "border-b border-[var(--line-subtle)] rounded-none",
        "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-standard)]",
        isSelected
          ? "bg-[var(--accent-wash)]"
          : "hover:bg-[var(--surface-raised)]",
      ].join(" ")}
    >
      <SeverityRule severity={severity} selected={isSelected} />
      <div className="flex min-w-0 flex-1 flex-col justify-center py-[var(--space-3)] pl-[var(--console-row-pad)]">
        <div className="truncate text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]">
          {title}
        </div>

        {/* Metadata: --ink-tertiary is 3.67:1, permitted here because none
            of this is something a user must read in order to act. */}
        <div className="mt-[var(--space-1)] flex flex-wrap items-center gap-x-[var(--space-2)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-tertiary)]">
          {metaParts.map((part, index) => (
            <span
              key={part}
              className="flex items-center gap-x-[var(--space-2)]"
            >
              {index > 0 && <span aria-hidden="true">·</span>}
              <span
                data-testid={index === 0 ? "issue-severity-label" : undefined}
              >
                {part}
              </span>
            </span>
          ))}
          {isVerified && (
            <>
              <span aria-hidden="true">·</span>
              <span
                data-testid="issue-verified-badge"
                className="text-[var(--state-verified)]"
              >
                Verified
              </span>
            </>
          )}
        </div>

        {possibleDuplicateCount > 0 && (
          <div
            data-testid="issue-possible-count"
            className="mt-[var(--space-1)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--accent-text)]"
          >
            {possibleDuplicateCount}{" "}
            {possibleDuplicateCount === 1
              ? "similar issue — review"
              : "similar issues — review"}
          </div>
        )}
      </div>

      {/* Category as plain text, not a pill, not a badge. */}
      <span
        data-testid="issue-category-label"
        className="hidden shrink-0 self-center text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-secondary)] sm:inline"
      >
        {CATEGORY_LABEL[category]}
      </span>

      <span
        data-testid="issue-occurrence-count"
        className="w-[var(--console-count-col)] shrink-0 self-center text-right tabular-nums text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-semibold text-[var(--ink-primary)]"
      >
        {occurrenceCount}
      </span>
    </Link>
  );
}
