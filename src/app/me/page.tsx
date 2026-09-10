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
    <div className="min-h-screen bg-paper">
      <header className="border-b border-hairline bg-raised px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href="/" className="text-label-lg text-ink">
            Repro
          </Link>
          <span aria-hidden="true" className="text-hairline">
            /
          </span>
          <span className="text-label text-slate">{session.displayName}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <div className="text-figure tabular-nums text-ink">
              {summary.balance}
            </div>
            <p className="text-label text-slate">coins earned</p>
          </div>
          <div>
            <div className="text-figure tabular-nums text-ink">
              {summary.signalScore}
            </div>
            <p className="text-label text-slate">signal score</p>
          </div>
          <div>
            <div className="text-figure tabular-nums text-ink">
              {summary.issuesFound}
            </div>
            <p className="text-label text-slate">
              {summary.issuesFound === 1 ? "issue found" : "issues found"}
            </p>
          </div>
        </div>

        <p className="mt-4 max-w-measure text-label text-slate">
          Coins are claim tokens, redeemable with the studio that awarded them
          for keys, in-game items or a credits mention. They are not money and
          cannot be cashed out. You have filed {summary.reportCount}{" "}
          {summary.reportCount === 1 ? "report" : "reports"}.
        </p>

        {summary.rateLimited && (
          <p
            role="status"
            className="mt-4 max-w-measure border-l-[3px] border-l-sev-high bg-raised px-4 py-3 text-label text-ink"
          >
            Your signal score is below 40, so you can file five reports an hour
            for now. It recovers as the issues you report get verified — one
            good find is worth three.
          </p>
        )}

        <section aria-labelledby="earnings-heading" className="mt-10">
          <h2 id="earnings-heading" className="text-label-lg text-ink">
            Earnings
          </h2>
          {summary.entries.length === 0 ? (
            <p className="mt-2 max-w-measure text-label text-slate">
              Nothing yet. You are paid when a studio verifies an issue you were
              the first to report, so the fastest way to earn is to find
              something nobody else has.
            </p>
          ) : (
            <ul className="mt-4 border-t border-hairline">
              {summary.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-4 border-b border-hairline py-3"
                >
                  <div className="min-w-0">
                    <p className="text-label-lg text-ink">
                      {entry.issueTitle ?? REASON_LABEL[entry.reason]}
                    </p>
                    <p className="mt-0.5 text-label text-slate">
                      {entry.campaignTitle}
                      <span aria-hidden="true"> · </span>
                      {formatDate(entry.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-label-lg tabular-nums text-verified">
                    +{entry.amount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="nda-heading" className="mt-10">
          <h2 id="nda-heading" className="text-label-lg text-ink">
            What you have signed
          </h2>
          <p className="mt-1 max-w-measure text-label text-slate">
            The exact wording you agreed to is fingerprinted, so neither side
            can change it afterwards.
          </p>
          {summary.signatures.length === 0 ? (
            <p className="mt-2 text-label text-slate">
              You have not signed an NDA yet.
            </p>
          ) : (
            <ul className="mt-4 border-t border-hairline">
              {summary.signatures.map((signature) => (
                <li
                  key={`${signature.campaignTitle}-${signature.signedAt.toISOString()}`}
                  className="border-b border-hairline py-3"
                >
                  <p className="text-label-lg text-ink">
                    {signature.campaignTitle}
                  </p>
                  <p className="mt-0.5 text-label text-slate">
                    Signed {formatDate(signature.signedAt)} as “
                    {signature.typedName}”
                  </p>
                  <p className="mt-1 font-mono text-[11px] break-all text-slate">
                    {signature.ndaBodyHash}
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
