import Link from "next/link";
import { redirect } from "next/navigation";

import { getTesterSummary } from "@/server/services/rewardService";
import { getSession } from "@/server/session";

const REASON_LABEL: Record<string, string> = {
  ISSUE_VERIFIED: "Issue verified",
  FIRST_REPORTER_BONUS: "First to report",
  MANUAL_ADJUSTMENT: "Adjustment",
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function MePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const summary = await getTesterSummary(session.sub);

  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--ink-primary)] font-sans">
      <header className="border-b border-[var(--line-subtle)] bg-[var(--surface-raised)] px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-semibold text-[var(--ink-primary)]"
            >
              Repro
            </Link>
            <span
              aria-hidden="true"
              className="text-[var(--line-subtle)]"
            >
              /
            </span>
            <span className="text-xs text-[var(--ink-secondary)]">
              {session.displayName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/play"
              className="text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
            >
              Playtests
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="p-4 bg-[var(--surface-raised)] border border-[var(--line-subtle)] rounded-[var(--radius-md)]">
            <div className="text-[28px] md:text-[36px] font-bold tabular-nums font-mono text-[var(--ink-primary)]">
              {summary.balance}
            </div>
            <p className="text-[13px] text-[var(--ink-secondary)] mt-1">
              coins earned
            </p>
          </div>
          <div className="p-4 bg-[var(--surface-raised)] border border-[var(--line-subtle)] rounded-[var(--radius-md)]">
            <div className="text-[28px] md:text-[36px] font-bold tabular-nums font-mono text-[var(--ink-primary)]">
              {summary.signalScore}
            </div>
            <p className="text-[13px] text-[var(--ink-secondary)] mt-1">
              signal score
            </p>
          </div>
          <div className="p-4 bg-[var(--surface-raised)] border border-[var(--line-subtle)] rounded-[var(--radius-md)]">
            <div className="text-[28px] md:text-[36px] font-bold tabular-nums font-mono text-[var(--ink-primary)]">
              {summary.issuesFound}
            </div>
            <p className="text-[13px] text-[var(--ink-secondary)] mt-1">
              {summary.issuesFound === 1 ? "issue found" : "issues found"}
            </p>
          </div>
        </div>

        <p className="max-w-[68ch] text-[14px] leading-[1.6] text-[var(--ink-secondary)]">
          Coins are claim tokens, redeemable with the studio that awarded them
          for keys, in-game items or a credits mention. They are not money and
          cannot be cashed out. You have filed {summary.reportCount}{" "}
          {summary.reportCount === 1 ? "report" : "reports"}.
        </p>

        {summary.rateLimited && (
          <p
            role="status"
            className="max-w-[68ch] border-l-[3px] border-l-[var(--sev-high)] bg-[var(--surface-raised)] px-4 py-3 text-[13px] text-[var(--ink-primary)] rounded-r-[var(--radius-sm)] leading-relaxed"
          >
            Your signal score is below 40, so you can file five reports an hour
            for now. It recovers as the issues you report get verified.
          </p>
        )}

        <section aria-labelledby="earnings-heading" className="space-y-3 pt-4">
          <h2
            id="earnings-heading"
            className="text-[16px] font-semibold text-[var(--ink-primary)]"
          >
            Earnings
          </h2>
          {summary.entries.length === 0 ? (
            <p className="text-[13px] text-[var(--ink-secondary)]">
              Nothing yet. You are rewarded when a studio verifies an issue you
              were the first to report.
            </p>
          ) : (
            <ul className="border-t border-[var(--line-subtle)] divide-y divide-[var(--line-subtle)]">
              {summary.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[var(--ink-primary)]">
                      {entry.issueTitle ?? REASON_LABEL[entry.reason]}
                    </p>
                    <p className="text-[12px] text-[var(--ink-secondary)] mt-0.5">
                      {entry.campaignTitle}
                      <span aria-hidden="true"> · </span>
                      {formatDate(entry.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[14px] font-semibold font-mono tabular-nums text-[var(--accent)]">
                    +{entry.amount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="nda-heading" className="space-y-3 pt-4">
          <h2
            id="nda-heading"
            className="text-[16px] font-semibold text-[var(--ink-primary)]"
          >
            Signed Confidentiality Records
          </h2>
          <p className="text-[13px] text-[var(--ink-secondary)] max-w-[68ch]">
            The exact wording you agreed to is cryptographically hashed, so
            neither side can alter it post-signing.
          </p>
          {summary.signatures.length === 0 ? (
            <p className="text-[13px] text-[var(--ink-secondary)]">
              You have not signed an NDA yet.
            </p>
          ) : (
            <ul className="border-t border-[var(--line-subtle)] divide-y divide-[var(--line-subtle)]">
              {summary.signatures.map((signature) => (
                <li
                  key={`${signature.campaignTitle}-${signature.signedAt.toISOString()}`}
                  className="py-3 space-y-1"
                >
                  <p className="text-[14px] font-medium text-[var(--ink-primary)]">
                    {signature.campaignTitle}
                  </p>
                  <p className="text-[12px] text-[var(--ink-secondary)]">
                    Signed {formatDate(signature.signedAt)} as “
                    {signature.typedName}”
                  </p>
                  <p className="font-mono text-[11px] break-all text-[var(--ink-tertiary)] bg-[var(--surface-sunken)] p-2 rounded-[var(--radius-sm)]">
                    SHA-256: {signature.ndaBodyHash}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
