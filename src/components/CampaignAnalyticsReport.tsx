"use client";

import { useMemo } from "react";

import {
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  buildCampaignAnalytics,
  type AnalyticsBoardStats,
  type AnalyticsIssueRow,
  type NamedCount,
} from "@/domain/analytics/campaignSummary";

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--sev-critical)",
  HIGH: "var(--sev-high)",
  MEDIUM: "var(--ink-secondary)",
  LOW: "var(--ink-tertiary)",
};

const CATEGORY_COLOR: Record<string, string> = {
  CRASH: "var(--sev-critical)",
  GAMEPLAY: "var(--accent-text)",
  PERFORMANCE: "var(--sev-high)",
  VISUAL: "var(--state-verified)",
  AUDIO: "#7dd3c0",
  UX: "var(--ink-secondary)",
};

function BarChart({
  rows,
  colors,
}: {
  rows: readonly NamedCount[];
  colors: Record<string, string>;
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[12px]">
            <span className="font-medium text-[var(--ink-primary)]">
              {row.label}
            </span>
            <span className="font-mono tabular-nums text-[var(--ink-secondary)]">
              {row.count} · {row.percent}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${(row.count / max) * 100}%`,
                background: colors[row.key] ?? "var(--accent)",
              }}
            />
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="text-[13px] text-[var(--ink-tertiary)]">No data yet.</p>
      )}
    </div>
  );
}

function Donut({
  rows,
  colors,
}: {
  rows: readonly NamedCount[];
  colors: Record<string, string>;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 120 120"
        className="h-36 w-36 shrink-0"
        role="img"
        aria-label="Severity distribution"
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--surface-sunken)"
          strokeWidth="14"
        />
        {rows.map((row) => {
          const length = (row.count / total) * circumference;
          const dash = `${length} ${circumference - length}`;
          const el = (
            <circle
              key={row.key}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={colors[row.key] ?? "var(--accent)"}
              strokeWidth="14"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform="rotate(-90 60 60)"
            />
          );
          offset += length;
          return el;
        })}
        <text
          x="60"
          y="56"
          textAnchor="middle"
          className="fill-[var(--ink-primary)]"
          style={{ fontSize: "18px", fontWeight: 600 }}
        >
          {total}
        </text>
        <text
          x="60"
          y="72"
          textAnchor="middle"
          className="fill-[var(--ink-secondary)]"
          style={{ fontSize: "9px" }}
        >
          issues
        </text>
      </svg>
      <ul className="space-y-1.5 text-[12px]">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: colors[row.key] }}
            />
            <span className="text-[var(--ink-secondary)]">{row.label}</span>
            <span className="font-mono tabular-nums text-[var(--ink-primary)]">
              {row.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CampaignAnalyticsReport(props: {
  campaignTitle: string;
  issues: readonly AnalyticsIssueRow[];
  stats: AnalyticsBoardStats;
  generatedAt?: string;
}) {
  const summary = useMemo(
    () => buildCampaignAnalytics(props.issues, props.stats),
    [props.issues, props.stats],
  );

  const generatedAt =
    props.generatedAt ??
    new Date().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

  function exportPdf() {
    window.print();
  }

  return (
    <div className="analytics-report space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:block">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
            Campaign report
          </p>
          <h1 className="mt-1 text-[length:var(--type-title-size)] font-semibold tracking-[-0.03em] text-[var(--ink-primary)]">
            {props.campaignTitle}
          </h1>
          <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-[var(--ink-secondary)]">
            {summary.headline}
          </p>
          <p className="mt-2 text-[12px] text-[var(--ink-tertiary)]">
            Generated {generatedAt}
          </p>
        </div>
        <button
          type="button"
          onClick={exportPdf}
          className="print:hidden inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-[13px] font-semibold text-[var(--accent-on-fill)] shadow-[0_8px_24px_var(--accent-glow)] transition hover:bg-[var(--accent-hover)] active:scale-[0.98]"
        >
          Export PDF
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Reports", value: summary.totalReports },
          { label: "Issues", value: summary.totalIssues },
          { label: "Noise filtered", value: summary.noiseCount },
          {
            label: "Compression",
            value: summary.compressionRatio
              ? `${summary.compressionRatio}×`
              : "—",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[20px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-4"
          >
            <div className="text-[28px] font-semibold tracking-[-0.03em] tabular-nums text-[var(--ink-primary)]">
              {card.value}
            </div>
            <div className="mt-1 text-[12px] text-[var(--ink-secondary)]">
              {card.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[22px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-5">
          <h2 className="text-[15px] font-semibold text-[var(--ink-primary)]">
            Complaint type
          </h2>
          <p className="mt-1 mb-4 text-[12px] text-[var(--ink-secondary)]">
            Share of clustered issues by category
          </p>
          <BarChart rows={summary.byCategory} colors={CATEGORY_COLOR} />
        </section>

        <section className="rounded-[22px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-5">
          <h2 className="text-[15px] font-semibold text-[var(--ink-primary)]">
            Severity mix
          </h2>
          <p className="mt-1 mb-4 text-[12px] text-[var(--ink-secondary)]">
            Issue count by severity (not weighted)
          </p>
          <Donut rows={summary.bySeverity} colors={SEVERITY_COLOR} />
        </section>

        <section className="rounded-[22px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-5">
          <h2 className="text-[15px] font-semibold text-[var(--ink-primary)]">
            Severity by volume
          </h2>
          <p className="mt-1 mb-4 text-[12px] text-[var(--ink-secondary)]">
            Weighted by occurrence count — where tester pain concentrates
          </p>
          <BarChart rows={summary.bySeverityWeighted} colors={SEVERITY_COLOR} />
        </section>

        <section className="rounded-[22px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-5">
          <h2 className="text-[15px] font-semibold text-[var(--ink-primary)]">
            Pipeline status
          </h2>
          <p className="mt-1 mb-4 text-[12px] text-[var(--ink-secondary)]">
            Open vs verified vs resolved
          </p>
          <BarChart
            rows={summary.byStatus}
            colors={{
              OPEN: "var(--accent-text)",
              VERIFIED: "var(--state-verified)",
              FIXED: "var(--ink-secondary)",
              REJECTED: "var(--ink-tertiary)",
            }}
          />
        </section>
      </div>

      <section className="rounded-[22px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-5">
        <h2 className="text-[15px] font-semibold text-[var(--ink-primary)]">
          Most reported problems
        </h2>
        <p className="mt-1 mb-4 text-[12px] text-[var(--ink-secondary)]">
          Ranked by occurrence — start here
        </p>
        {summary.topIssues.length === 0 ? (
          <p className="text-[13px] text-[var(--ink-tertiary)]">
            No issues to rank yet.
          </p>
        ) : (
          <ol className="divide-y divide-[var(--line-subtle)]">
            {summary.topIssues.map((issue, index) => (
              <li
                key={issue.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-[var(--ink-tertiary)]">
                      #{index + 1}
                    </span>
                    <p className="truncate text-[14px] font-medium text-[var(--ink-primary)]">
                      {issue.title}
                    </p>
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
                    {CATEGORY_LABEL[issue.category]} ·{" "}
                    {SEVERITY_LABEL[issue.severity]} · {issue.status}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[14px] font-semibold tabular-nums text-[var(--ink-primary)]">
                    {issue.occurrenceCount}
                  </div>
                  <div className="text-[11px] text-[var(--ink-tertiary)]">
                    {issue.shareOfReports}% of clustered volume
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="mt-6 text-[12px] leading-relaxed text-[var(--ink-tertiary)]">
        This report is derived from Repro&apos;s triage board. Similar tester
        reports are clustered into issues; noise is filtered before scoring.
        Use the ranked list and severity-by-volume chart to decide what to fix
        first.
      </p>
    </div>
  );
}
