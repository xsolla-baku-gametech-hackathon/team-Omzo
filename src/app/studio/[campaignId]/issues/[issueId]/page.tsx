import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PossibleDuplicates } from "@/components/PossibleDuplicates";
import type { PossibleDuplicate } from "@/components/PossibleDuplicates";
import { VerifyIssueButton } from "@/components/VerifyIssueButton";
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

  const screenshots = occurrences.filter(
    (report) => report.screenshotData !== null,
  );
  const isVerified = issue.status === "VERIFIED";

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-hairline bg-raised px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Link href="/studio" className="text-label-lg text-ink">
            Repro
          </Link>
          <span aria-hidden="true" className="text-hairline">
            /
          </span>
          <Link
            href={`/studio/${campaignId}`}
            className="text-label text-slate hover:text-ink"
          >
            Board
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-label text-slate">
          <span className={isVerified ? "text-verified" : undefined}>
            {isVerified ? "Verified" : "Open"}
          </span>
          <span aria-hidden="true"> · </span>
          <span
            className={
              issue.severity === "CRITICAL" ? "text-critical" : undefined
            }
          >
            {SEVERITY_LABEL[issue.severity] ?? issue.severity}
          </span>
          <span aria-hidden="true"> · </span>
          {CATEGORY_LABEL[issue.category] ?? issue.category}
        </p>

        <div className="mt-2 flex items-start justify-between gap-6">
          <h1 className="max-w-measure text-xl font-semibold tracking-tight text-ink">
            {issue.title}
          </h1>
          <div className="shrink-0 text-right">
            <div className="text-figure tabular-nums text-ink">
              {issue.occurrenceCount}
            </div>
            <div className="text-label text-slate">
              {issue.occurrenceCount === 1 ? "occurrence" : "occurrences"}
            </div>
          </div>
        </div>

        {!isVerified && (
          <div className="mt-4">
            <VerifyIssueButton issueId={issue.id} />
          </div>
        )}

        {/* Screenshots first: a developer recognises the bug before reading. */}
        <section aria-labelledby="shots-heading" className="mt-8">
          <h2 id="shots-heading" className="sr-only">
            Screenshots
          </h2>
          {screenshots.length === 0 ? (
            <p className="border border-hairline bg-raised px-4 py-6 text-label text-slate">
              No screenshots on these occurrences. The overlay captures the game
              canvas with every report, so reports filed through it will show
              here.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {screenshots.slice(0, 6).map((report) => (
                <li key={report.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={report.screenshotData ?? ""}
                    alt={`Screenshot from the occurrence reported as: ${report.body}`}
                    className="w-full border border-hairline"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The shared-traits panel, stated as a sentence rather than a chart. */}
        <section aria-labelledby="traits-heading" className="mt-8">
          <h2 id="traits-heading" className="text-label text-slate">
            What these occurrences have in common
          </h2>
          <p className="mt-1 max-w-measure text-base leading-relaxed text-ink">
            {issue.synthesizedTraits.sentence}
          </p>
        </section>

        <PossibleDuplicates duplicates={duplicates} />

        <section aria-labelledby="occurrences-heading" className="mt-10">
          <h2 id="occurrences-heading" className="text-label-lg text-ink">
            Occurrences
          </h2>
          <ul className="mt-4 border-t border-hairline">
            {occurrences.slice(0, 25).map((report) => {
              const state = report.gameState as unknown as GameState;
              const errorLines = report.consoleTail.filter((line) =>
                /error|exception|fatal|uncaught/i.test(line),
              );
              return (
                <li key={report.id} className="border-b border-hairline py-3">
                  <p className="text-label-lg text-ink">{report.body}</p>
                  <p className="mt-0.5 text-label text-slate">
                    {(
                      report as unknown as {
                        reporter?: { displayName: string };
                      }
                    ).reporter?.displayName ?? "A tester"}
                    <span aria-hidden="true"> · </span>
                    {state.scene} ({Math.round(state.x)}, {Math.round(state.y)},{" "}
                    {Math.round(state.z)})
                  </p>
                  {errorLines.length > 0 && (
                    // Monospace earns its place here and nowhere else: these
                    // are lines a developer will copy into a search.
                    <pre className="mt-2 overflow-x-auto border-l-2 border-hairline pl-3 font-mono text-[12px] leading-relaxed text-slate">
                      {errorLines.join("\n")}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
          {occurrences.length > 25 && (
            <p className="mt-3 text-label text-slate">
              Showing the 25 most recent of {occurrences.length}.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
