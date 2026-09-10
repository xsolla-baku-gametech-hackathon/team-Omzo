import Link from "next/link";

import { ThemeToggle } from "@/components/ThemeToggle";
import { getOpenCampaigns } from "@/server/services/campaignService";
import { getSession } from "@/server/session";

export default async function PlayIndexPage() {
  const session = await getSession();
  const campaigns = await getOpenCampaigns();

  return (
    <div className="min-h-screen bg-[var(--color-surface-page)] text-[var(--color-ink-primary)] font-sans">
      {/* Header */}
      <header className="border-b border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold text-lg tracking-tight text-[var(--color-ink-primary)]">
              Repro
            </Link>
            <span className="text-[var(--color-line-hairline)]">/</span>
            <span className="text-sm font-medium text-[var(--color-ink-secondary)]">
              Playtest Campaigns
            </span>
          </div>

          <div className="flex items-center gap-4">
            {session ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-ink-secondary)] hidden sm:inline">
                  {session.displayName}
                </span>
                <Link
                  href="/me"
                  className="py-1.5 px-3 border border-[var(--color-line-hairline)] hover:border-[var(--color-line-strong)] text-xs font-medium rounded-[var(--radius-sm)] transition-colors"
                >
                  My Rewards &amp; Signal
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="py-1.5 px-3 text-xs font-medium text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)]"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="py-1.5 px-3 bg-[var(--color-ink-primary)] text-[var(--color-surface-page)] text-xs font-medium rounded-[var(--radius-sm)] hover:opacity-90"
                >
                  Join as Tester
                </Link>
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-primary)]">
            Open Playtests
          </h1>
          <p className="text-sm text-[var(--color-ink-secondary)] mt-1 max-w-xl leading-relaxed">
            Pre-release technical builds looking for critical bugs and traversal breaks. Sign the NDA to receive traceable access and earn bounty tokens.
          </p>
        </div>

        {campaigns.length === 0 ? (
          <div className="border border-dashed border-[var(--color-line-hairline)] p-12 text-center rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)]">
            <p className="text-sm text-[var(--color-ink-secondary)]">
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
                  className="border border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] p-6 rounded-[var(--radius-md)] flex flex-col md:flex-row md:items-start md:justify-between gap-6 hover:border-[var(--color-line-strong)] transition-colors shadow-xs"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold tracking-tight text-[var(--color-ink-primary)]">
                        {c.title}
                      </h2>
                      <span className="text-[11px] px-2 py-0.5 border border-[var(--color-line-hairline)] font-mono text-[var(--color-ink-secondary)] rounded-[var(--radius-sm)]">
                        {c.buildKind}
                      </span>
                    </div>
                    {studio && (
                      <div className="text-xs font-medium text-[var(--color-ink-secondary)]">
                        Studio: <span className="text-[var(--color-ink-primary)]">{studio.name}</span>
                      </div>
                    )}
                    <p className="text-sm text-[var(--color-ink-secondary)] leading-relaxed pt-1">
                      {c.pitch}
                    </p>
                    <div className="text-xs bg-[var(--color-surface-sunken)] p-3 border border-[var(--color-line-hairline)] rounded-[var(--radius-sm)] mt-3">
                      <span className="font-semibold text-[var(--color-ink-primary)] uppercase tracking-wider text-[10px]">
                        Test Focus:
                      </span>{" "}
                      <span className="text-[var(--color-ink-secondary)]">{c.testFocus}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between self-stretch border-t md:border-t-0 md:border-l border-[var(--color-line-hairline)] pt-4 md:pt-0 md:pl-6 min-w-[180px]">
                    <div className="space-y-1 text-right mb-4">
                      <div className="text-xs text-[var(--color-ink-secondary)]">Reward per issue</div>
                      <div className="text-xl font-semibold tracking-tight text-[var(--color-ink-primary)] font-mono">
                        {c.rewardPerIssue} coins
                      </div>
                      <div className="text-[11px] text-[var(--color-ink-tertiary)]">
                        Pool: {c.rewardPoolTotal} coins
                      </div>
                    </div>

                    <Link
                      href={`/play/${c.id}/nda`}
                      className="w-full text-center py-2.5 px-4 bg-[var(--color-ink-primary)] text-[var(--color-surface-page)] text-xs font-medium rounded-[var(--radius-sm)] hover:opacity-90 transition-opacity"
                    >
                      Sign NDA &amp; Play
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
