"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IssueRow } from "@/components/IssueRow";
import { RawStream } from "@/components/RawStream";
import { toBoardIssue } from "@/components/boardIssue";
import type { IssueRowSource } from "@/components/boardIssue";
import { Button } from "@/components/Button";
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
  /** Dominant OS family across the issue's reports (V2 §5.2 second line). */
  readonly platform?: string | null;
  /** The scene the issue is pinned to. */
  readonly scene?: string | null;
  /** Epoch ms of first occurrence, for the age. */
  readonly firstSeenAt?: number | null;
}

export interface BoardStats {
  readonly totalReports: number;
  readonly totalIssues: number;
  readonly noiseCount: number;
}

interface BoardPayload {
  readonly issues: readonly IssueRowSource[];
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

const SORT_OPTIONS: ReadonlyArray<readonly [SortOption, string]> = [
  ["severity", "By severity"],
  ["count", "By occurrence"],
  ["newest", "By newest"],
];

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
  const [reports, setReports] =
    useState<readonly StreamReport[]>(initialReports);
  const [stats, setStats] = useState<BoardStats>(initialStats);
  const [connection, setConnection] = useState<Connection>("live");
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
    setIssues(payload.issues.map(toBoardIssue));
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

  // Verification lives on the issue detail screen (V2 §5.3). The board row
  // has one job: get you to the issue. UI_SPEC.md §5 asks for a keyboard
  // path board -> issue -> verify, which is exactly that route.
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
      {/* Columns become tabs below lg (UI_SPEC.md §6.2). */}
      <div className="flex border-b border-[var(--line-subtle)] lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("issues")}
          className={`flex-1 border-b-2 py-[var(--space-3)] text-center text-[length:var(--type-ui-size)] transition-colors ${
            mobileTab === "issues"
              ? "border-[var(--accent)] font-medium text-[var(--ink-primary)]"
              : "border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
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
          className={`flex flex-1 items-center justify-center gap-[var(--space-2)] border-b-2 py-[var(--space-3)] text-center text-[length:var(--type-ui-size)] transition-colors ${
            mobileTab === "stream"
              ? "border-[var(--accent)] font-medium text-[var(--ink-primary)]"
              : "border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
          }`}
        >
          <span>Live</span>
          {unseenLiveCount > 0 && mobileTab !== "stream" && (
            <span className="tabular-nums text-[length:var(--type-meta-size)] text-[var(--accent-text)]">
              {unseenLiveCount}
            </span>
          )}
        </button>
      </div>

      {/* Asymmetric Desktop Layout: 62% Left, 38% Right, 32px Gutter, No Divider (§3.2) */}
      {/* 62/38 with a 32px gutter and no divider — the difference in density
          does the separating. fr, not %, because 62% + 38% + a gutter is
          wider than the container and overflows the page by exactly the
          gutter. minmax(0,…) so the long issue titles can truncate. */}
      <div className="grid items-start gap-[var(--console-gutter)] lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
        {/* Left Column: Triage Issues */}
        <section
          aria-labelledby="board-heading"
          className={mobileTab === "issues" ? "block" : "hidden lg:block"}
        >
          {/* Header and the three inline sort chips. No filter drawer. */}
          <div className="mb-[var(--space-4)] flex flex-col justify-between gap-[var(--space-3)] sm:flex-row sm:items-baseline">
            <h2
              id="board-heading"
              className="text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]"
            >
              {stats.totalIssues} issues
              <span className="font-normal text-[var(--ink-secondary)]">
                {" "}
                from {counted} reports
              </span>
            </h2>

            <div className="flex items-center gap-[var(--space-1)]">
              {SORT_OPTIONS.map(([option, label]) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSortOption(option)}
                  aria-pressed={sortOption === option}
                  className={`rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-[length:var(--type-meta-size)] transition-colors duration-[var(--dur-fast)] ${
                    sortOption === option
                      ? "bg-[var(--accent-wash)] text-[var(--ink-primary)]"
                      : "text-[var(--ink-secondary)] hover:bg-[var(--surface-hover-subtle)] hover:text-[var(--ink-primary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Issue List or Empty State */}
          {issues.length === 0 ? (
            <EmptyState
              title="No reports yet"
              description="Share the campaign access link with testers, or play the session yourself to file the first issue."
              action={
                <Button variant="primary" onClick={copyCampaignLink}>
                  {copiedLink ? "Link copied" : "Copy campaign link"}
                </Button>
              }
            />
          ) : (
            <ol className="border-t border-[var(--line-subtle)]">
              {sortedIssues.map((issue) => (
                <li key={issue.id}>
                  <IssueRow
                    id={issue.id}
                    campaignId={campaignId}
                    title={issue.title}
                    category={issue.category}
                    severity={issue.severity}
                    occurrenceCount={issue.occurrenceCount}
                    status={issue.status}
                    platform={issue.platform}
                    scene={issue.scene}
                    firstSeenAt={issue.firstSeenAt}
                  />
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
          <div className="mb-[var(--space-4)] flex items-baseline justify-between gap-[var(--space-4)]">
            <h2
              id="stream-heading"
              className="text-[length:var(--type-ui-size)] text-[var(--ink-secondary)]"
            >
              As it arrived
            </h2>
            {/* Plain text, no pulsing dot. Motion answers a user action;
                a connection indicator is not one (UI_SPEC.md §0.4). */}
            <div className="flex items-center gap-[var(--space-3)] text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
              <span className="tabular-nums">{stats.totalReports} reports</span>
              <span>{connection === "live" ? "Live" : "Reconnecting"}</span>
            </div>
          </div>

          <RawStream reports={reports} now={now} />
        </section>
      </div>
    </div>
  );
}
