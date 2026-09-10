"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IssueRow } from "@/components/IssueRow";
import { RawStream } from "@/components/RawStream";
import { EmptyState } from "@/components/EmptyState";
import type { StreamReport } from "@/components/RawStream";
import type { IssueCategory, Severity } from "@/domain/triage/types";

export interface BoardIssue {
  readonly id: string;
  readonly title: string;
  readonly category: IssueCategory;
  readonly severity: Severity;
  readonly status: string;
  readonly occurrenceCount: number;
}

export interface BoardStats {
  readonly totalReports: number;
  readonly totalIssues: number;
  readonly noiseCount: number;
}

interface BoardPayload {
  readonly issues: readonly BoardIssue[];
  readonly reports: readonly {
    readonly id: string;
    readonly body: string;
    readonly gameState: { readonly scene?: string } | null;
    readonly isNoise: boolean;
    readonly createdAt: string;
  }[];
  readonly stats: BoardStats;
}

const POLL_INTERVAL_MS = 3000;
type Connection = "live" | "polling";
type SortOption = "severity" | "count" | "newest";

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export function IssueBoard({
  campaignId,
  initialIssues,
  initialReports,
  initialStats,
}: {
  readonly campaignId: string;
  readonly initialIssues: readonly BoardIssue[];
  readonly initialReports: readonly StreamReport[];
  readonly initialStats: BoardStats;
}) {
  const [issues, setIssues] = useState<readonly BoardIssue[]>(initialIssues);
  const [reports, setReports] = useState<readonly StreamReport[]>(initialReports);
  const [stats, setStats] = useState<BoardStats>(initialStats);
  const [connection, setConnection] = useState<Connection>("live");
  const [verifying, setVerifying] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Sorting & Mobile tabs
  const [sortOption, setSortOption] = useState<SortOption>("severity");
  const [mobileTab, setMobileTab] = useState<"issues" | "stream">("issues");
  const [unseenLiveCount, setUnseenLiveCount] = useState(0);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(tick);
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/campaigns/${campaignId}/board`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as BoardPayload;
    setIssues(payload.issues);
    setStats(payload.stats);
    setReports(
      payload.reports.map((report) => ({
        id: report.id,
        body: report.body,
        scene: report.gameState?.scene ?? "unknown",
        isNoise: report.isNoise,
        issueTitle: null,
        createdAt: new Date(report.createdAt).getTime(),
      })),
    );
  }, [campaignId]);

  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (pending.current !== null) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      void refresh();
    }, 250);
  }, [refresh]);

  useEffect(() => {
    const source = new EventSource(`/api/campaigns/${campaignId}/events`);
    let poll: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (poll !== null) return;
      setConnection("polling");
      poll = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    };

    source.addEventListener("connected", () => setConnection("live"));

    source.addEventListener("report_ingested", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        reportId: string;
        body: string;
        scene: string;
        isNoise: boolean;
        issueTitle: string | null;
        createdAt: number;
      };
      setReports((current) =>
        [
          {
            id: payload.reportId,
            body: payload.body,
            scene: payload.scene,
            isNoise: payload.isNoise,
            issueTitle: payload.issueTitle,
            createdAt: payload.createdAt,
          },
          ...current,
        ].slice(0, 100),
      );
      setStats((current) => ({
        ...current,
        totalReports: current.totalReports + 1,
        noiseCount: current.noiseCount + (payload.isNoise ? 1 : 0),
      }));
      setUnseenLiveCount((c) => c + 1);
    });

    source.addEventListener("issue_updated", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        issueId: string;
        severity: Severity;
        occurrenceCount: number;
        status: string;
      };
      setIssues((current) =>
        current.map((issue) =>
          issue.id === payload.issueId
            ? {
                ...issue,
                severity: payload.severity,
                occurrenceCount: payload.occurrenceCount,
                status: payload.status,
              }
            : issue,
        ),
      );
      scheduleRefresh();
    });

    source.addEventListener("issue_created", () => scheduleRefresh());
    source.addEventListener("issue_verified", () => scheduleRefresh());
    source.onerror = () => startPolling();

    return () => {
      source.close();
      if (poll !== null) clearInterval(poll);
      if (pending.current !== null) clearTimeout(pending.current);
    };
  }, [campaignId, refresh, scheduleRefresh]);

  const verify = async (issueId: string) => {
    setVerifying(issueId);
    try {
      const response = await fetch(`/api/issues/${issueId}/verify`, {
        method: "POST",
      });
      if (response.ok) await refresh();
    } finally {
      setVerifying(null);
    }
  };

  const copyCampaignLink = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/play/${campaignId}/nda`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // Sorted issues list
  const sortedIssues = useMemo(() => {
    const list = [...issues];
    switch (sortOption) {
      case "severity":
        return list.sort(
          (a, b) =>
            SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
            b.occurrenceCount - a.occurrenceCount,
        );
      case "count":
        return list.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
      case "newest":
        return list; // Preserves backend newest order
      default:
        return list;
    }
  }, [issues, sortOption]);

  const counted = stats.totalReports - stats.noiseCount;

  return (
    <div className="space-y-6">
      {/* Mobile Tab Bar (<1024px) */}
      <div className="flex lg:hidden border-b border-[var(--color-line-hairline)] bg-[var(--color-surface-page)]">
        <button
          type="button"
          onClick={() => setMobileTab("issues")}
          className={`flex-1 py-2.5 text-[14px] font-medium border-b-2 text-center transition-colors ${
            mobileTab === "issues"
              ? "border-[var(--color-accent)] text-[var(--color-ink-primary)] font-semibold"
              : "border-transparent text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)]"
          }`}
        >
          Issues ({stats.totalIssues})
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileTab("stream");
            setUnseenLiveCount(0);
          }}
          className={`flex-1 py-2.5 text-[14px] font-medium border-b-2 text-center transition-colors flex items-center justify-center gap-1.5 ${
            mobileTab === "stream"
              ? "border-[var(--color-accent)] text-[var(--color-ink-primary)] font-semibold"
              : "border-transparent text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)]"
          }`}
        >
          <span>Live Stream</span>
          {unseenLiveCount > 0 && mobileTab !== "stream" && (
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
          )}
        </button>
      </div>

      {/* Asymmetric Desktop Layout: 62% Left, 38% Right, 32px Gutter, No Divider (§3.2) */}
      <div className="grid gap-8 lg:grid-cols-[62%_38%] items-start">
        {/* Left Column: Triage Issues */}
        <section
          aria-labelledby="board-heading"
          className={mobileTab === "issues" ? "block" : "hidden lg:block"}
        >
          {/* Header & Inline Sorting Chips */}
          <div className="mb-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
            <div>
              <h2 id="board-heading" className="text-[16px] md:text-[18px] font-semibold text-[var(--color-ink-primary)]">
                {stats.totalIssues} issues
                <span className="text-[var(--color-ink-secondary)] font-normal"> from {counted} reports</span>
              </h2>
            </div>

            {/* Sorting Chips */}
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="text-[var(--color-ink-secondary)] mr-1 hidden sm:inline">Sort:</span>
              <button
                type="button"
                onClick={() => setSortOption("severity")}
                className={`px-2.5 py-1 rounded-[var(--radius-sm)] transition-colors ${
                  sortOption === "severity"
                    ? "bg-[var(--color-ink-primary)] text-[var(--color-surface-page)] font-medium"
                    : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)]"
                }`}
              >
                Severity
              </button>
              <button
                type="button"
                onClick={() => setSortOption("count")}
                className={`px-2.5 py-1 rounded-[var(--radius-sm)] transition-colors ${
                  sortOption === "count"
                    ? "bg-[var(--color-ink-primary)] text-[var(--color-surface-page)] font-medium"
                    : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)]"
                }`}
              >
                Occurrence
              </button>
              <button
                type="button"
                onClick={() => setSortOption("newest")}
                className={`px-2.5 py-1 rounded-[var(--radius-sm)] transition-colors ${
                  sortOption === "newest"
                    ? "bg-[var(--color-ink-primary)] text-[var(--color-surface-page)] font-medium"
                    : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)]"
                }`}
              >
                Newest
              </button>
            </div>
          </div>

          {/* Issue List or Empty State */}
          {issues.length === 0 ? (
            <EmptyState
              title="No reports yet"
              description="Share the campaign access link with testers, or play the session yourself to file the first issue."
              action={
                <button
                  type="button"
                  onClick={copyCampaignLink}
                  className="px-4 py-2 bg-[var(--color-ink-primary)] text-[var(--color-surface-page)] text-[13px] font-medium rounded-[var(--radius-sm)] hover:opacity-90 transition-opacity"
                >
                  {copiedLink ? "✓ Link Copied!" : "Copy Campaign Access Link"}
                </button>
              }
            />
          ) : (
            <ol className="border-t border-[var(--color-line-hairline)] bg-[var(--color-surface-page)] divide-y divide-[var(--color-line-hairline)]">
              {sortedIssues.map((issue) => (
                <li key={issue.id} className="relative group">
                  <IssueRow
                    id={issue.id}
                    campaignId={campaignId}
                    title={issue.title}
                    category={issue.category}
                    severity={issue.severity}
                    occurrenceCount={issue.occurrenceCount}
                    status={issue.status}
                  />
                  {issue.status !== "VERIFIED" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void verify(issue.id);
                      }}
                      disabled={verifying === issue.id}
                      className="absolute right-4 bottom-2.5 text-[12px] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] underline underline-offset-2 disabled:opacity-50 transition-colors"
                    >
                      {verifying === issue.id ? "Verifying…" : "Verify"}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Right Column: Live Raw Stream */}
        <section
          aria-labelledby="stream-heading"
          className={mobileTab === "stream" ? "block" : "hidden lg:block"}
        >
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 id="stream-heading" className="text-[14px] font-medium text-[var(--color-ink-secondary)]">
              As it arrived
            </h2>
            <div className="flex items-center gap-3 text-[12px] text-[var(--color-ink-secondary)]">
              <span className="tabular-nums font-mono">{stats.totalReports} total</span>
              <span className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    connection === "live" ? "bg-[var(--color-accent)]" : "bg-[var(--color-warn)] animate-pulse"
                  }`}
                />
                {connection === "live" ? "Live" : "Polling"}
              </span>
            </div>
          </div>

          <div className="border border-[var(--color-line-hairline)] rounded-[var(--radius-sm)] overflow-hidden bg-[var(--color-surface-raised)]">
            <RawStream reports={reports} now={now} />
          </div>
        </section>
      </div>
    </div>
  );
}
