"use client";

import { useEffect, useState } from "react";

/**
 * RawStream — UI_SPEC.md §3.2, §5
 *
 * The right-hand column: monochrome, 13px, --ink-secondary.
 * Timestamps in a fixed-width column.
 * New reports enter with a 220ms fade and a 1-second --accent-soft flash.
 * aria-live="polite" for accessibility.
 */

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
      <p className="py-6 px-4 text-[13px] text-[var(--color-ink-secondary)] leading-relaxed">
        Nothing yet. Reports appear here the moment a tester submits one.
      </p>
    );
  }

  // Virtualise / limit window to 100 items per budget (§8)
  const visible = reports.slice(0, 100);

  return (
    <ol
      aria-live="polite"
      className="divide-y divide-[var(--color-line-hairline)] bg-[var(--color-surface-raised)]"
    >
      {visible.map((report) => {
        const isFlashing = report.id === latestReportId;

        return (
          <li
            key={report.id}
            style={{
              backgroundColor: isFlashing ? "var(--color-accent-soft)" : "transparent",
              transition: "background-color 220ms ease-out",
            }}
            className="px-4 py-3 flex items-start gap-3"
          >
            <span className="w-10 shrink-0 text-right tabular-nums text-[12px] text-[var(--color-ink-secondary)] pt-0.5">
              {timeAgo(report.createdAt, now)}
            </span>

            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-baseline gap-2 text-[12px] text-[var(--color-ink-secondary)]">
                <span className="truncate">{report.scene}</span>
                {report.isNoise && (
                  <span className="italic text-[11px] text-[var(--color-ink-tertiary)]">
                    (noise)
                  </span>
                )}
              </div>
              <p
                className={`text-[13px] leading-[1.4] line-clamp-2 ${
                  report.isNoise
                    ? "text-[var(--color-ink-tertiary)]"
                    : "text-[var(--color-ink-primary)]"
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
