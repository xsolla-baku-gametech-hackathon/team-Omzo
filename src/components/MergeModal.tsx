"use client";

import { useEffect, useCallback } from "react";
import { Button } from "@/components/Button";

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[var(--color-surface-raised)] border border-[var(--color-line-hairline)] rounded-[var(--radius-md)] shadow-[var(--elevation-modal)] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-line-hairline)] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-[18px] font-semibold text-[var(--color-ink-primary)] tracking-[-0.01em]">
              Review Possible Duplicate
            </h2>
            <p className="text-[13px] text-[var(--color-ink-secondary)] mt-0.5">
              Compare candidate issues side by side before merging.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            aria-label="Close dialog"
            className="p-1.5 text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Signal breakdown */}
          <div className="p-4 bg-[var(--color-surface-sunken)] rounded-[var(--radius-sm)] border border-[var(--color-line-hairline)]">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[12px] uppercase font-semibold tracking-wider text-[var(--color-ink-secondary)]">
                Computed Similarity Score
              </span>
              <span className="text-[16px] font-semibold text-[var(--color-ink-primary)] font-mono">
                {(signals.overall * 100).toFixed(0)}%
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <div className="text-[11px] text-[var(--color-ink-secondary)] mb-1">
                  Lexical (TF-IDF)
                </div>
                <div className="h-1.5 w-full bg-[var(--color-line-hairline)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-accent)]"
                    style={{ width: `${Math.min(100, signals.lexical * 100)}%` }}
                  />
                </div>
                <div className="text-[11px] text-[var(--color-ink-secondary)] font-mono mt-0.5">
                  {(signals.lexical * 100).toFixed(0)}%
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[var(--color-ink-secondary)] mb-1">
                  Game Proximity
                </div>
                <div className="h-1.5 w-full bg-[var(--color-line-hairline)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-accent)]"
                    style={{ width: `${Math.min(100, signals.proximity * 100)}%` }}
                  />
                </div>
                <div className="text-[11px] text-[var(--color-ink-secondary)] font-mono mt-0.5">
                  {(signals.proximity * 100).toFixed(0)}%
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[var(--color-ink-secondary)] mb-1">
                  Log Signature
                </div>
                <div className="h-1.5 w-full bg-[var(--color-line-hairline)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-accent)]"
                    style={{ width: `${Math.min(100, signals.signature * 100)}%` }}
                  />
                </div>
                <div className="text-[11px] text-[var(--color-ink-secondary)] font-mono mt-0.5">
                  {(signals.signature * 100).toFixed(0)}%
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[var(--color-ink-secondary)] mb-1">
                  Environment
                </div>
                <div className="h-1.5 w-full bg-[var(--color-line-hairline)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-accent)]"
                    style={{ width: `${Math.min(100, signals.environment * 100)}%` }}
                  />
                </div>
                <div className="text-[11px] text-[var(--color-ink-secondary)] font-mono mt-0.5">
                  {(signals.environment * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          </div>

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Issue A */}
            <div className="p-4 border border-[var(--color-line-hairline)] rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] space-y-3">
              <div className="flex items-baseline justify-between border-b border-[var(--color-line-hairline)] pb-2">
                <span className="text-[12px] uppercase font-semibold text-[var(--color-ink-secondary)]">
                  Primary Issue
                </span>
                <span className="text-[14px] font-semibold text-[var(--color-ink-primary)] font-mono">
                  {sourceIssue.occurrenceCount} reports
                </span>
              </div>
              <h3 className="text-[16px] font-semibold text-[var(--color-ink-primary)] leading-snug">
                {sourceIssue.title}
              </h3>
              <div className="space-y-2 pt-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-ink-secondary)] block">
                  Sample Reports
                </span>
                {sourceIssue.sampleReports.map((r, i) => (
                  <p
                    key={i}
                    className="text-[13px] text-[var(--color-ink-secondary)] bg-[var(--color-surface-sunken)] p-2.5 rounded-[var(--radius-sm)] line-clamp-2 leading-relaxed"
                  >
                    “{r}”
                  </p>
                ))}
              </div>
            </div>

            {/* Issue B */}
            <div className="p-4 border border-[var(--color-line-hairline)] rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] space-y-3">
              <div className="flex items-baseline justify-between border-b border-[var(--color-line-hairline)] pb-2">
                <span className="text-[12px] uppercase font-semibold text-[var(--color-ink-secondary)]">
                  Candidate Duplicate
                </span>
                <span className="text-[14px] font-semibold text-[var(--color-ink-primary)] font-mono">
                  {targetIssue.occurrenceCount} reports
                </span>
              </div>
              <h3 className="text-[16px] font-semibold text-[var(--color-ink-primary)] leading-snug">
                {targetIssue.title}
              </h3>
              <div className="space-y-2 pt-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-ink-secondary)] block">
                  Sample Reports
                </span>
                {targetIssue.sampleReports.map((r, i) => (
                  <p
                    key={i}
                    className="text-[13px] text-[var(--color-ink-secondary)] bg-[var(--color-surface-sunken)] p-2.5 rounded-[var(--radius-sm)] line-clamp-2 leading-relaxed"
                  >
                    “{r}”
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] flex items-center justify-end gap-3 shrink-0">
          <Button
            variant="secondary"
            onClick={onKeepSeparate}
            disabled={isProcessing}
          >
            Keep separate
          </Button>
          <Button
            variant="primary"
            onClick={onMerge}
            disabled={isProcessing}
          >
            {isProcessing ? "Merging..." : "Merge into one issue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
