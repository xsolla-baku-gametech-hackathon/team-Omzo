"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { IssueRow } from "@/components/IssueRow";
import { RawStream } from "@/components/RawStream";
import type { StreamReport } from "@/components/RawStream";
import type { IssueCategory, Severity } from "@/domain/triage/types";

/**
 * The core screen (SPEC.md §8).
 *
 * Two columns, asymmetric on purpose. Left: the issues, as full-width rows
 * with the occurrence count set large. Right: the same reports as they
 * arrived, quieter and smaller. A studio reads the right column today and a
 * developer loses two days to it; the left column is what Repro turns that
 * into. The layout is the argument, so the columns are not balanced.
 */

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

/** SSE is the mechanism; polling is what keeps the demo alive when it isn't. */
const POLL_INTERVAL_MS = 3000;

type Connection = "live" | "polling";

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
  const [verifying, setVerifying] = useState<string | null>(null);

  // Rendered relative times need a clock, and reading Date.now() during
  // render would differ between server and client and hydrate mismatched.
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

  // A burst of reports would otherwise mean a burst of refetches. Seeding a
  // campaign posts hundreds in a row, which is exactly the case that would
  // melt the board if every one triggered its own round trip.
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
        ].slice(0, 50),
      );
      setStats((current) => ({
        ...current,
        totalReports: current.totalReports + 1,
        noiseCount: current.noiseCount + (payload.isNoise ? 1 : 0),
      }));
    });

    // An occurrence count changing is applied from the payload; a new issue
    // needs the full row, so that one goes back to the server.
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

    // The fallback exists because the venue Wi-Fi will fail and because SSE
    // through a proxy is not something to bet a demo on. It engages on its
    // own; nobody has to notice.
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

  const counted = stats.totalReports - stats.noiseCount;

  return (
    <div className="grid gap-8 lg:grid-cols-[62fr_38fr]">
      <section aria-labelledby="board-heading">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id="board-heading" className="text-label-lg text-ink">
            {stats.totalIssues} issues
            <span className="text-slate"> from {counted} reports</span>
          </h2>
          <span className="text-label text-slate">
            {connection === "live" ? "Live" : "Reconnecting, polling"}
          </span>
        </div>

        {issues.length === 0 ? (
          <div className="border border-hairline bg-raised px-4 py-10 text-center">
            <p className="text-label-lg text-ink">No issues yet</p>
            <p className="mx-auto mt-1 max-w-measure text-label text-slate">
              Issues appear as testers report. Send the campaign link to your
              testers, or press F1 in the session to file the first one.
            </p>
          </div>
        ) : (
          <ol className="border-t border-hairline">
            {issues.map((issue) => (
              <li key={issue.id} className="relative">
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
                    onClick={() => void verify(issue.id)}
                    disabled={verifying === issue.id}
                    className="absolute right-4 bottom-3 text-label text-slate underline underline-offset-2 hover:text-ink disabled:opacity-50"
                  >
                    {verifying === issue.id ? "Verifying…" : "Verify"}
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        aria-labelledby="stream-heading"
        className="lg:border-l lg:border-hairline lg:pl-6"
      >
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id="stream-heading" className="text-label-lg text-slate">
            As it arrived
          </h2>
          <span className="text-label text-slate tabular-nums">
            {stats.totalReports}
          </span>
        </div>
        <div className="border-t border-hairline">
          <RawStream reports={reports} now={now} />
        </div>
      </section>
    </div>
  );
}
