import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ConsoleNavLink, ConsoleShell } from "@/components/ConsoleShell";
import { PossibleDuplicates } from "@/components/PossibleDuplicates";
import type { PossibleDuplicate } from "@/components/PossibleDuplicates";
import {
  VerifiedLabel,
  VerifyIssueButton,
} from "@/components/VerifyIssueButton";
import { ScreenshotGrid } from "@/components/ScreenshotGrid";
import { TraitSentence } from "@/components/TraitSentence";
import type { GameState } from "@/domain/triage/types";
import {
  IssueNotFoundError,
  UnauthorizedIssueMutationError,
  getIssueDetail,
} from "@/server/services/issueService";
import { getStudioCampaign } from "@/server/services/campaignService";
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
  let campaign;
  try {
    [issue, campaign] = await Promise.all([
      getIssueDetail(issueId, session.studioId),
      getStudioCampaign(campaignId, session.studioId),
    ]);
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
    <ConsoleShell
      campaignName={campaign.title}
      actions={
        <ConsoleNavLink href={`/studio/${campaignId}`}>Board</ConsoleNavLink>
      }
    >
      {/* Room for the action bar, which is fixed on every width. */}
      <div className="pb-[calc(var(--console-topbar-h)+var(--space-6))]">
        <div className="max-w-[var(--console-max)]">
          {/* Severity, status and category, as plain text. No pills. */}
          <div className="flex items-center gap-[var(--space-2)] text-[length:var(--type-meta-size)] text-[var(--ink-secondary)]">
            <span>{SEVERITY_LABEL[issue.severity] ?? issue.severity}</span>
            <span aria-hidden="true">·</span>
            <span>{CATEGORY_LABEL[issue.category] ?? issue.category}</span>
            {isVerified && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[var(--state-verified)]">Verified</span>
              </>
            )}
          </div>

          <div className="mt-[var(--space-2)] flex items-baseline justify-between gap-[var(--space-6)]">
            <h1 className="text-[length:var(--type-title-size)] leading-[var(--type-title-lh)] tracking-[var(--type-title-ls)] font-semibold text-[var(--ink-primary)]">
              {issue.title}
            </h1>
            <div className="shrink-0 text-right">
              <div className="text-[length:var(--type-title-size)] leading-[var(--type-title-lh)] font-semibold tabular-nums text-[var(--ink-primary)]">
                {issue.occurrenceCount}
              </div>
              <div className="text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
                {issue.occurrenceCount === 1 ? "report" : "reports"}
              </div>
            </div>
          </div>

          {/* Screenshots. No heading: six thumbnails do not need to be
              announced, and an all-caps eyebrow is forbidden (UI_SPEC §2). */}
          {screenshots.length > 0 && (
            <section
              aria-label="Report screenshots"
              className="mt-[var(--space-6)]"
            >
              <ScreenshotGrid screenshots={screenshots.slice(0, 6)} />
            </section>
          )}

          {/* The traits sentence: its own block, nothing beside it. */}
          <TraitSentence sentence={issue.synthesizedTraits.sentence} />

          <PossibleDuplicates duplicates={duplicates} />

          <section
            aria-labelledby="occurrences-heading"
            className="mt-[var(--space-8)]"
          >
            <div className="flex items-baseline justify-between border-b border-[var(--line-subtle)] pb-[var(--space-2)]">
              <h2
                id="occurrences-heading"
                className="text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]"
              >
                {occurrences.length}{" "}
                {occurrences.length === 1 ? "occurrence" : "occurrences"}
              </h2>
              <span className="text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
                Newest first
              </span>
            </div>

            <ul>
              {occurrences.slice(0, 25).map((report) => {
                const state = report.gameState as unknown as GameState;
                const errorLines = report.consoleTail.filter((line) =>
                  /error|exception|fatal|uncaught/i.test(line),
                );

                return (
                  <li
                    key={report.id}
                    className="border-b border-[var(--line-subtle)] py-[var(--space-4)]"
                  >
                    <p className="max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-primary)]">
                      {report.body}
                    </p>
                    <div className="mt-[var(--space-2)] flex flex-wrap items-center gap-[var(--space-2)] text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
                      <span className="text-[var(--ink-secondary)]">
                        {(
                          report as unknown as {
                            reporter?: { displayName: string };
                          }
                        ).reporter?.displayName ?? "A tester"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{state.scene}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        ({Math.round(state.x)}, {Math.round(state.y)},{" "}
                        {Math.round(state.z)})
                      </span>
                    </div>

                    {/* Console tail: one of exactly two places monospace is
                        allowed. Own scroll, capped at 240px (V2 §5.3). */}
                    {errorLines.length > 0 && (
                      <pre className="mt-[var(--space-3)] max-h-[var(--console-tail-max)] overflow-auto rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] p-[var(--space-3)] font-mono text-[length:var(--type-mono-size)] leading-[var(--type-mono-lh)] text-[var(--ink-secondary)]">
                        {errorLines.join("\n")}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>

            {occurrences.length > 25 && (
              <p className="mt-[var(--space-4)] text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
                Showing the 25 most recent of {occurrences.length} occurrences.
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Actions: bottom-right on desktop, a full bottom bar on mobile. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line-subtle)] bg-[var(--surface-raised)] px-[var(--console-pad)] py-[var(--space-3)] pb-[max(env(safe-area-inset-bottom),var(--space-3))]">
        <div className="mx-auto flex max-w-[var(--console-max)] items-center justify-end gap-[var(--space-3)]">
          <Link
            href={`/studio/${campaignId}`}
            className="hidden text-[length:var(--type-meta-size)] text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)] sm:mr-auto sm:inline"
          >
            Back to board
          </Link>
          {isVerified ? (
            <VerifiedLabel />
          ) : (
            <VerifyIssueButton issueId={issue.id} />
          )}
        </div>
      </div>
    </ConsoleShell>
  );
}
