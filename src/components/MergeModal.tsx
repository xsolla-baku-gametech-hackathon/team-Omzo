"use client";

import { useEffect, useCallback } from "react";
import { Button } from "@/components/Button";
import { SignalBar } from "@/components/SignalBar";

export interface MergeCandidate {
  readonly id: string;
  readonly title: string;
  readonly occurrenceCount: number;
  readonly sampleReports: readonly string[];
}

export interface SimilaritySignals {
  readonly lexical: number;
  readonly proximity: number;
  readonly signature: number;
  readonly environment: number;
  readonly overall: number;
}

interface MergeModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly sourceIssue: MergeCandidate;
  readonly targetIssue: MergeCandidate;
  readonly signals: SimilaritySignals;
  readonly onMerge: () => Promise<void>;
  readonly onKeepSeparate: () => Promise<void>;
  readonly isProcessing?: boolean;
}

export function MergeModal({
  isOpen,
  onClose,
  sourceIssue,
  targetIssue,
  signals,
  onMerge,
  onKeepSeparate,
  isProcessing = false,
}: MergeModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isProcessing) {
        onClose();
      }
    },
    [isOpen, isProcessing, onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Merge issues review"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-page)]/70 p-[var(--space-4)]"
    >
      {/* edge-lit is the one Stage primitive that crosses into the Console:
          a modal is a raised surface and the rim reads as an edge, not as
          decoration (V2 §5.4). */}
      <div className="edge-lit flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-xl)] bg-[var(--surface-overlay)] shadow-[var(--elevation-modal)]">
        <div className="flex shrink-0 items-start justify-between gap-[var(--space-4)] px-[var(--space-6)] py-[var(--space-4)]">
          <div>
            <h2 className="text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]">
              Are these the same bug?
            </h2>
            <p className="mt-[var(--space-1)] text-[length:var(--type-meta-size)] text-[var(--ink-secondary)]">
              The engine scored these between &ldquo;same bug&rdquo; and
              &ldquo;different bug&rdquo; and declined to guess.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            aria-label="Close dialog"
            className="shrink-0 rounded-[var(--radius-sm)] p-[var(--space-2)] text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
          >
            &#10005;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-[var(--space-6)] pb-[var(--space-6)]">
          {/* The two issues, side by side. Stacked on a phone. */}
          <div className="grid grid-cols-1 gap-[var(--space-6)] md:grid-cols-2">
            {[sourceIssue, targetIssue].map((issue, index) => (
              <div key={issue.id}>
                <div className="flex items-baseline justify-between gap-[var(--space-3)] border-b border-[var(--line-subtle)] pb-[var(--space-2)]">
                  <span className="text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
                    {index === 0 ? "This issue" : "The candidate"}
                  </span>
                  <span className="tabular-nums text-[length:var(--type-meta-size)] text-[var(--ink-secondary)]">
                    {issue.occurrenceCount}{" "}
                    {issue.occurrenceCount === 1 ? "report" : "reports"}
                  </span>
                </div>
                <h3 className="mt-[var(--space-3)] text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]">
                  {issue.title}
                </h3>
                <div className="mt-[var(--space-3)] space-y-[var(--space-2)]">
                  {issue.sampleReports.map((report, i) => (
                    <p
                      key={i}
                      className="line-clamp-2 rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] px-[var(--space-3)] py-[var(--space-2)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-secondary)]"
                    >
                      {report}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* The four component signals, under both panels (§5.4). */}
          <div className="mt-[var(--space-8)] border-t border-[var(--line-subtle)] pt-[var(--space-6)]">
            <div className="flex items-baseline justify-between">
              <span className="text-[length:var(--type-meta-size)] text-[var(--ink-secondary)]">
                Similarity
              </span>
              <span className="tabular-nums text-[length:var(--type-heading-size)] font-semibold text-[var(--ink-primary)]">
                {Math.round(signals.overall * 100)}%
              </span>
            </div>

            <div className="mt-[var(--space-4)] grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-4">
              <SignalBar label="Wording" value={signals.lexical} />
              <SignalBar label="Position in scene" value={signals.proximity} />
              <SignalBar label="Console signature" value={signals.signature} />
              <SignalBar label="Hardware" value={signals.environment} />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-[var(--space-3)] border-t border-[var(--line-subtle)] px-[var(--space-6)] py-[var(--space-4)]">
          <Button
            variant="secondary"
            onClick={onKeepSeparate}
            disabled={isProcessing}
          >
            Keep separate
          </Button>
          <Button variant="primary" onClick={onMerge} disabled={isProcessing}>
            {isProcessing ? "Merging…" : "Merge into one issue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
