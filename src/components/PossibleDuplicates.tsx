"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The band between the thresholds, handed to a human (SPEC.md §5.3).
 *
 * The engine scored these somewhere between "same bug" and "different bug"
 * and declined to guess. That is the design working, not failing: a wrongly
 * merged report hides a real bug behind someone else's issue, while a wrongly
 * split one costs a developer one click. This panel is that click.
 */

export interface PossibleDuplicate {
  readonly id: string;
  readonly body: string;
  readonly scene: string;
  readonly reporterName: string;
}

export function PossibleDuplicates({
  duplicates,
}: {
  readonly duplicates: readonly PossibleDuplicate[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (duplicates.length === 0) return null;

  const act = async (reportId: string, action: "confirm" | "split") => {
    setBusy(reportId);
    try {
      const response = await fetch(`/api/reports/${reportId}/${action}`, {
        method: "POST",
      });
      if (response.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="possible-heading" className="mt-[var(--space-8)]">
      <h2
        id="possible-heading"
        className="text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]"
      >
        {duplicates.length} possible{" "}
        {duplicates.length === 1 ? "duplicate" : "duplicates"}
      </h2>
      <p className="mt-[var(--space-1)] max-w-[var(--body-measure)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-secondary)]">
        Close enough to be this bug, not close enough to assume it. They are not
        counted in the occurrence count until you say so.
      </p>

      <ul className="mt-[var(--space-4)] border-t border-[var(--line-subtle)]">
        {duplicates.map((duplicate) => (
          <li
            key={duplicate.id}
            className="flex flex-wrap items-start justify-between gap-[var(--space-3)] border-b border-[var(--line-subtle)] py-[var(--space-3)]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[length:var(--type-ui-size)] text-[var(--ink-primary)]">
                {duplicate.body}
              </p>
              <p className="mt-[var(--space-1)] text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
                {duplicate.reporterName}
                <span aria-hidden="true"> · </span>
                {duplicate.scene}
              </p>
            </div>
            <div className="flex shrink-0 gap-[var(--space-4)] text-[length:var(--type-meta-size)]">
              <button
                type="button"
                disabled={busy === duplicate.id}
                onClick={() => void act(duplicate.id, "confirm")}
                className="text-[var(--accent-text)] underline underline-offset-2 disabled:opacity-50"
              >
                Same bug
              </button>
              <button
                type="button"
                disabled={busy === duplicate.id}
                onClick={() => void act(duplicate.id, "split")}
                className="text-[var(--ink-secondary)] underline underline-offset-2 hover:text-[var(--ink-primary)] disabled:opacity-50"
              >
                Its own issue
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
