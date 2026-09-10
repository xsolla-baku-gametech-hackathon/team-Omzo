import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PossibleDuplicates } from "@/components/PossibleDuplicates";
import type { PossibleDuplicate } from "@/components/PossibleDuplicates";
import { VerifyIssueButton } from "@/components/VerifyIssueButton";
import { ScreenshotGrid } from "@/components/ScreenshotGrid";
import { TraitSentence } from "@/components/TraitSentence";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { GameState } from "@/domain/triage/types";
import {
  IssueNotFoundError,
  UnauthorizedIssueMutationError,
  getIssueDetail,
} from "@/server/services/issueService";
import { getSession } from "@/server/session";

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const CATEGORY_LABEL: Record<string, string> = {
  CRASH: "Crash",
  VISUAL: "Visual",
  GAMEPLAY: "Gameplay",
  PERFORMANCE: "Performance",
  AUDIO: "Audio",
  UX: "Interface",
};

export default async function IssueDetailPage(props: {
  params: Promise<{ campaignId: string; issueId: string }>;
}) {
  const { campaignId, issueId } = await props.params;
  const session = await getSession();

  if (!session || session.role !== "STUDIO" || !session.studioId) {
    redirect("/login");
  }

  let issue;
  try {
    issue = await getIssueDetail(issueId, session.studioId);
  } catch (error) {
    if (
      error instanceof UnauthorizedIssueMutationError ||
      error instanceof IssueNotFoundError
    ) {
      notFound();
    }
    throw error;
  }

  const occurrences = issue.reports.filter(
    (report) => !report.isPossibleDuplicate,
  );
  const duplicates: PossibleDuplicate[] = issue.reports
    .filter((report) => report.isPossibleDuplicate)
    .map((report) => ({
      id: report.id,
      body: report.body,
      scene: (report.gameState as unknown as GameState).scene,
      reporterName:
        (report as unknown as { reporter?: { displayName: string } }).reporter
          ?.displayName ?? "A tester",
    }));

  const screenshots = occurrences
    .filter((report) => report.screenshotData !== null)
    .map((report) => ({
      id: report.id,
      url: report.screenshotData as string,
      scene: (report.gameState as unknown as GameState)?.scene,
      caption: report.body,
    }));

  const isVerified = issue.status === "VERIFIED";

  return (
    <div className="min-h-screen bg-[var(--color-surface-page)] text-[var(--color-ink-primary)] font-sans pb-24">
      {/* Header */}
      <header className="border-b border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/studio" className="text-[14px] font-semibold text-[var(--color-ink-primary)]">
              Repro
            </Link>
            <span aria-hidden="true" className="text-[var(--color-line-hairline)]">
              /
            </span>
            <Link
              href={`/studio/${campaignId}`}
              className="text-[14px] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)]"
            >
              Board
            </Link>
            <span aria-hidden="true" className="text-[var(--color-line-hairline)]">
              /
            </span>
            <span className="text-[14px] text-[var(--color-ink-secondary)] truncate max-w-[200px]">
              {issue.title}
            </span>
          </div>

          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Severity, Status, and Category */}
        <div>
          <div className="flex items-center gap-2 text-[13px] text-[var(--color-ink-secondary)]">
            <span
              className={
                isVerified
                  ? "text-[var(--color-accent)] font-semibold"
                  : "text-[var(--color-ink-secondary)]"
              }
            >
              {isVerified ? "Verified Issue" : "Active Issue"}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={
                issue.severity === "CRITICAL"
                  ? "text-[var(--color-alert)] font-semibold"
                  : undefined
              }
            >
              {SEVERITY_LABEL[issue.severity] ?? issue.severity}
            </span>
            <span aria-hidden="true">·</span>
            <span>{CATEGORY_LABEL[issue.category] ?? issue.category}</span>
          </div>

          <div className="mt-2 flex items-baseline justify-between gap-6">
            <h1 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.02em] text-[var(--color-ink-primary)] leading-[1.2]">
              {issue.title}
            </h1>
            <div className="shrink-0 text-right">
              <span className="text-[26px] md:text-[32px] font-bold tabular-nums font-mono text-[var(--color-ink-primary)]">
                {issue.occurrenceCount}
              </span>
              <div className="text-[12px] text-[var(--color-ink-secondary)]">
                {issue.occurrenceCount === 1 ? "report" : "reports"}
              </div>
            </div>
          </div>
        </div>

        {/* 1. Screenshots Grid at Top (§3.3) */}
        {screenshots.length > 0 && (
          <section aria-labelledby="shots-heading">
            <h2 id="shots-heading" className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-ink-secondary)] mb-3">
              Captured Screenshots
            </h2>
            <ScreenshotGrid screenshots={screenshots.slice(0, 6)} />
          </section>
        )}

        {/* 2. Shared Traits as a Sentence Block in Full Measure (§3.3) */}
        <section aria-labelledby="traits-heading">
          <TraitSentence sentence={issue.synthesizedTraits.sentence} />
        </section>

        {/* 3. Possible Duplicates (Merge candidates) */}
        <PossibleDuplicates duplicates={duplicates} />

        {/* 4. Occurrences List */}
        <section aria-labelledby="occurrences-heading" className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-[var(--color-line-hairline)] pb-2">
            <h2 id="occurrences-heading" className="text-[16px] font-semibold text-[var(--color-ink-primary)]">
              Occurrences ({occurrences.length})
            </h2>
            <span className="text-[12px] text-[var(--color-ink-secondary)]">
              Sorted by newest
            </span>
          </div>

          <ul className="divide-y divide-[var(--color-line-hairline)]">
            {occurrences.slice(0, 25).map((report) => {
              const state = report.gameState as unknown as GameState;
              const errorLines = report.consoleTail.filter((line) =>
                /error|exception|fatal|uncaught/i.test(line),
              );

              return (
                <li key={report.id} className="py-4 space-y-2">
                  <p className="text-[15px] leading-[1.5] text-[var(--color-ink-primary)]">
                    {report.body}
                  </p>
                  <div className="flex items-center gap-2 text-[12px] text-[var(--color-ink-secondary)]">
                    <span className="font-medium text-[var(--color-ink-primary)]">
                      {(report as unknown as { reporter?: { displayName: string } }).reporter?.displayName ?? "A tester"}
                    </span>
                    <span>·</span>
                    <span>{state.scene}</span>
                    <span>·</span>
                    <span className="font-mono">
                      pos({Math.round(state.x)}, {Math.round(state.y)}, {Math.round(state.z)})
                    </span>
                  </div>

                  {errorLines.length > 0 && (
                    <div className="mt-2 p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-line-hairline)] rounded-[var(--radius-sm)] overflow-x-auto">
                      <pre className="font-mono text-[12px] leading-relaxed text-[var(--color-ink-secondary)]">
                        {errorLines.join("\n")}
                      </pre>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {occurrences.length > 25 && (
            <p className="text-[13px] text-[var(--color-ink-secondary)]">
              Showing the 25 most recent of {occurrences.length} occurrences.
            </p>
          )}
        </section>
      </main>

      {/* Pinned Action Bar: Desktop bottom-right / Mobile fixed bottom bar (§3.3) */}
      <div className="fixed bottom-0 inset-x-0 bg-[var(--color-surface-raised)] border-t border-[var(--color-line-hairline)] p-4 shadow-[var(--elevation-sheet)] pb-[env(safe-area-inset-bottom,16px)] z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <span className="text-[13px] text-[var(--color-ink-secondary)] hidden sm:inline">
            Status: <strong>{isVerified ? "Verified" : "Under Review"}</strong>
          </span>
          <div className="flex items-center gap-3 ml-auto">
            <Link
              href={`/studio/${campaignId}`}
              className="px-4 py-2 min-h-[44px] md:min-h-[36px] text-[14px] font-[450] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] rounded-[var(--radius-sm)] border border-[var(--color-line-hairline)] transition-colors flex items-center"
            >
              Back to Board
            </Link>
            {!isVerified && <VerifyIssueButton issueId={issue.id} />}
          </div>
        </div>
      </div>
    </div>
  );
}
