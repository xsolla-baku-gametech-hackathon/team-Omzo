"use client";

import { useEffect, useState } from "react";

/**
 * RawStream — UI_SPEC_V2_DARK.md §5.2
 *
 * The right-hand column: chaos, against the decisions on the left. A raised
 * panel with a 10px radius and its own scroll, items at --type-meta in
 * --ink-secondary, timestamps in a fixed 52px --ink-tertiary column, and no
 * severity colour anywhere — severity is a judgement, and nothing here has
 * been judged yet.
 *
 * A new item fades in over 220ms with an --accent-wash background for one
 * second, then goes plain. That flash is the whole realtime signal: no
 * badge, no toast, no counter animation. One signal per event.
 */

/** One raised panel, 10px radius, capped height with its own scroll. */
const PANEL =
  "rounded-[var(--radius-md)] bg-[var(--surface-raised)] max-h-[calc(100vh-var(--console-topbar-h)-var(--space-16))] lg:sticky lg:top-[var(--space-6)]";

/** UI_SPEC.md §8: the stream is windowed rather than grown without bound. */
const STREAM_WINDOW = 100;

export interface StreamReport {
  readonly id: string;
  readonly body: string;
  readonly scene: string;
  readonly isNoise: boolean;
  readonly issueTitle: string | null;
  readonly createdAt: number;
}

function timeAgo(createdAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - createdAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

export function RawStream({
  reports,
  now,
}: {
  readonly reports: readonly StreamReport[];
  readonly now: number;
}) {
  const [latestReportId, setLatestReportId] = useState<string | null>(null);

  useEffect(() => {
    if (reports.length > 0) {
      const topId = reports[0].id;
      setLatestReportId(topId);
      const timer = setTimeout(() => {
        setLatestReportId(null);
      }, 1000); // 1-second flash
      return () => clearTimeout(timer);
    }
  }, [reports]);

  if (reports.length === 0) {
    return (
      <div className={PANEL}>
        <div className="px-[var(--space-4)] py-[var(--space-5)]">
          <div
            aria-hidden
            className="mb-4 space-y-2 opacity-80"
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-page)]/60 px-3 py-2"
                style={{
                  animation: `empty-row-in 700ms cubic-bezier(0.22,1,0.36,1) ${i * 120}ms both`,
                }}
              >
                <span className="h-1.5 w-7 rounded-full bg-[var(--line-medium)]" />
                <span
                  className="h-1.5 flex-1 rounded-full bg-[var(--line-subtle)]"
                  style={{
                    animation: `empty-shimmer 1.8s ease-in-out ${i * 180}ms infinite`,
                  }}
                />
              </div>
            ))}
          </div>
          <p className="text-[length:var(--type-meta-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
            Waiting for the first report.
          </p>
          <p className="mt-1 text-[12px] text-[var(--ink-tertiary)]">
            New submissions flash here live the moment a tester hits submit.
          </p>
        </div>
      </div>
    );
  }

  // Windowing per UI_SPEC.md §8: the board caps its own state at 100, and
  // the column renders at most that, so the DOM never grows past the window.
  const visible = reports.slice(0, STREAM_WINDOW);

  return (
    <ol aria-live="polite" className={`${PANEL} overflow-y-auto`}>
      {visible.map((report) => {
        const isFlashing = report.id === latestReportId;

        return (
          <li
            key={report.id}
            style={{
              backgroundColor: isFlashing
                ? "var(--accent-wash)"
                : "transparent",
              transition:
                "background-color var(--dur-base) var(--ease-standard)",
            }}
            className="flex items-start gap-[var(--space-3)] border-b border-[var(--line-subtle)] px-[var(--space-4)] py-[var(--space-3)] last:border-b-0"
          >
            <span className="w-[var(--stream-time-col)] shrink-0 text-right tabular-nums text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-tertiary)]">
              {timeAgo(report.createdAt, now)}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-[var(--space-2)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-tertiary)]">
                <span className="truncate">{report.scene}</span>
                {report.isNoise && <span>noise</span>}
              </div>
              <p
                className={`line-clamp-2 text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] ${
                  report.isNoise
                    ? "text-[var(--ink-tertiary)]"
                    : "text-[var(--ink-secondary)]"
                }`}
              >
                {report.body}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
