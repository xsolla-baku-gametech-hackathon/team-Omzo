import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyPanel } from "@/components/EmptyPanel";
import { MeStats } from "@/components/MeStats";
import { RewardShelf } from "@/components/RewardShelf";
import { getShelfFor } from "@/server/services/rewardClaimService";
import { getTesterSummary } from "@/server/services/rewardService";
import { getSession } from "@/server/session";

const REASON_LABEL: Record<string, string> = {
  ISSUE_VERIFIED: "Issue verified",
  FIRST_REPORTER_BONUS: "First to report",
  MANUAL_ADJUSTMENT: "Adjustment",
  REWARD_CLAIMED: "Reward claimed",
  CLAIM_REFUNDED: "Claim refunded",
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function MePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [summary, shelf] = await Promise.all([
    getTesterSummary(session.sub),
    getShelfFor(session.sub),
  ]);

  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--ink-primary)] font-sans">
      <header className="border-b border-[var(--line-subtle)] bg-[var(--surface-raised)]/90 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-semibold text-[var(--ink-primary)]"
            >
              Repro
            </Link>
            <span aria-hidden="true" className="text-[var(--line-subtle)]">
              /
            </span>
            <span className="text-xs text-[var(--ink-secondary)]">
              {session.displayName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/play"
              className="text-xs text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
            >
              Playtests
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        <MeStats
          balance={summary.balance}
          signalScore={summary.signalScore}
          issuesFound={summary.issuesFound}
        />

        <p className="max-w-[68ch] text-[14px] leading-[1.6] text-[var(--ink-secondary)]">
          Coins are claim tokens, redeemable with the studio that awarded them
          for keys, in-game items, or a credits mention. They are not money and
          cannot be cashed out. You have filed {summary.reportCount}{" "}
          {summary.reportCount === 1 ? "report" : "reports"}.
        </p>

        {summary.rateLimited && (
          <p
            role="status"
            className="max-w-[68ch] rounded-r-[var(--radius-sm)] border-l-[3px] border-l-[var(--sev-high)] bg-[var(--surface-raised)] px-4 py-3 text-[13px] leading-relaxed text-[var(--ink-primary)]"
          >
            Your signal score is below 40, so you can file five reports an hour
            for now. It recovers as the issues you report get verified.
          </p>
        )}

        <section aria-labelledby="shelf-heading" className="space-y-3 pt-4">
          <h2
            id="shelf-heading"
            className="text-[16px] font-semibold text-[var(--ink-primary)]"
          >
            What your balance can reach
          </h2>
          <p className="max-w-[68ch] text-[13px] leading-[1.6] text-[var(--ink-secondary)]">
            Each studio stocks its own shelf, and you spend with the campaign
            that paid you — a key from one studio is not funded by another
            studio&rsquo;s playtest. Claiming debits the same ledger that paid
            you, and the studio sends the code by hand.
          </p>
          <RewardShelf
            rows={shelf.entries.map((entry) => ({
              id: entry.id,
              kind: entry.kind,
              label: entry.label,
              costCoins: entry.costCoins,
              remaining: entry.remaining,
              campaignTitle: entry.campaignTitle,
              campaignBalance: entry.campaignBalance,
              refusal: entry.verdict.allowed ? null : entry.verdict.reason,
              claim:
                entry.claim === null
                  ? null
                  : { status: entry.claim.status, code: entry.claim.code },
            }))}
          />
        </section>

        <section aria-labelledby="earnings-heading" className="space-y-3 pt-4">
          <h2
            id="earnings-heading"
            className="text-[16px] font-semibold text-[var(--ink-primary)]"
          >
            Earnings
          </h2>
          {summary.entries.length === 0 ? (
            <EmptyPanel
              visual="radar"
              title="No earnings yet"
              description="You are rewarded when a studio verifies an issue you were the first to report. Open a playtest and file something real."
              action={
                <Link
                  href="/play"
                  className="inline-flex rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)]"
                >
                  Browse playtests
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--line-subtle)] border-t border-[var(--line-subtle)]">
              {summary.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[var(--ink-primary)]">
                      {entry.issueTitle ?? REASON_LABEL[entry.reason]}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
                      {entry.campaignTitle}
                      <span aria-hidden="true"> · </span>
                      {formatDate(entry.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[14px] font-semibold tabular-nums text-[var(--accent-text)]">
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
            Signed confidentiality records
          </h2>
          <p className="max-w-[68ch] text-[13px] text-[var(--ink-secondary)]">
            The exact wording you agreed to is hashed (SHA-256), so neither side
            can quietly alter it after signing.
          </p>
          {summary.signatures.length === 0 ? (
            <p className="text-[13px] text-[var(--ink-secondary)]">
              You have not signed an NDA yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line-subtle)] border-t border-[var(--line-subtle)]">
              {summary.signatures.map((signature) => (
                <li
                  key={`${signature.campaignTitle}-${signature.signedAt.toISOString()}`}
                  className="space-y-1 py-3"
                >
                  <p className="text-[14px] font-medium text-[var(--ink-primary)]">
                    {signature.campaignTitle}
                  </p>
                  <p className="text-[12px] text-[var(--ink-secondary)]">
                    Signed {formatDate(signature.signedAt)} as “
                    {signature.typedName}”
                  </p>
                  <p className="break-all rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] p-2 font-mono text-[11px] text-[var(--ink-tertiary)]">
                    Record hash: {signature.ndaBodyHash}
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
