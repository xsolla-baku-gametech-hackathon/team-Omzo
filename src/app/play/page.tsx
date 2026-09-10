import Link from "next/link";

import { getOpenCampaigns } from "@/server/services/campaignService";
import { getSession } from "@/server/session";

export default async function PlayIndexPage() {
  const session = await getSession();
  const campaigns = await getOpenCampaigns();

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-hairline bg-raised px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold text-lg tracking-tight">
              Repro
            </Link>
            <span className="text-hairline">/</span>
            <span className="text-sm font-medium text-slate">
              Playtest Campaigns
            </span>
          </div>

          <div className="flex items-center gap-4">
            {session ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate">
                  {session.displayName}
                </span>
                <Link
                  href="/me"
                  className="py-1 px-2.5 border border-hairline hover:border-ink text-xs font-medium rounded-sm transition-colors"
                >
                  My Rewards &amp; Signal
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="py-1.5 px-3 text-xs font-medium text-slate hover:text-ink"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="py-1.5 px-3 bg-ink text-paper text-xs font-medium rounded-sm hover:opacity-90"
                >
                  Join as Tester
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Open Playtests
          </h1>
          <p className="text-sm text-slate mt-1 max-w-xl">
            Pre-release technical builds looking for critical bugs and traversal
            breaks. Sign the NDA to receive traceable access and earn bounty
            tokens.
          </p>
        </div>

        {campaigns.length === 0 ? (
          <div className="border border-dashed border-hairline p-12 text-center rounded-sm bg-raised/50">
            <p className="text-sm text-slate">
              No open playtests available right now.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {campaigns.map((c) => {
              const studio = (c as unknown as { studio?: { name: string } })
                .studio;

              return (
                <div
                  key={c.id}
                  className="border border-hairline bg-raised p-6 rounded-sm flex flex-col md:flex-row md:items-start md:justify-between gap-6 hover:border-slate/50 transition-colors"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold tracking-tight">
                        {c.title}
                      </h2>
                      <span className="text-[11px] px-2 py-0.5 border border-hairline font-mono text-slate rounded-xs">
                        {c.buildKind}
                      </span>
                    </div>
                    {studio && (
                      <div className="text-xs font-medium text-slate">
                        Studio: <span className="text-ink">{studio.name}</span>
                      </div>
                    )}
                    <p className="text-sm text-slate leading-relaxed pt-1">
                      {c.pitch}
                    </p>
                    <div className="text-xs bg-paper p-3 border border-hairline rounded-xs mt-3">
                      <span className="font-semibold text-ink uppercase tracking-wider text-[10px]">
                        Test Focus:
                      </span>{" "}
                      <span className="text-slate">{c.testFocus}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between self-stretch border-t md:border-t-0 md:border-l border-hairline pt-4 md:pt-0 md:pl-6 min-w-[180px]">
                    <div className="space-y-1 text-right mb-4">
                      <div className="text-xs text-slate">Reward per issue</div>
                      <div className="text-xl font-semibold tracking-tight text-ink">
                        {c.rewardPerIssue} coins
                      </div>
                      <div className="text-[11px] text-slate/70">
                        Pool: {c.rewardPoolTotal} coins
                      </div>
                    </div>

                    <Link
                      href={`/play/${c.id}/nda`}
                      className="w-full text-center py-2.5 px-4 bg-ink text-paper text-xs font-medium rounded-sm hover:opacity-90 transition-opacity"
                    >
                      Sign NDA &amp; Play →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
