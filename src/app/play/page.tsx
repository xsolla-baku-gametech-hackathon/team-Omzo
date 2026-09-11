import Link from "next/link";

import { EmptyPanel } from "@/components/EmptyPanel";
import { getOpenCampaigns } from "@/server/services/campaignService";
import { getSession } from "@/server/session";

export default async function PlayIndexPage() {
  const session = await getSession();
  const campaigns = await getOpenCampaigns();

  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--ink-primary)] font-sans">
      <header className="border-b border-[var(--line-subtle)] bg-[var(--surface-raised)]/90 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-[var(--ink-primary)]"
            >
              Repro
            </Link>
            <span className="text-[var(--line-subtle)]">/</span>
            <span className="text-sm font-medium text-[var(--ink-secondary)]">
              Playtests
            </span>
          </div>

          <div className="flex items-center gap-3">
            {session ? (
              <>
                <span className="hidden text-xs text-[var(--ink-secondary)] sm:inline">
                  {session.displayName}
                </span>
                <Link
                  href="/me"
                  className="rounded-full border border-[var(--line-subtle)] px-3 py-1.5 text-xs font-medium transition hover:border-[var(--line-strong)]"
                >
                  Rewards
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)]"
                >
                  Join as tester
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-6 py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 top-0 h-48 w-48 rounded-full opacity-50 blur-3xl"
          style={{ background: "var(--accent-wash)" }}
        />

        <div className="relative mb-8">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink-primary)]">
            Open playtests
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--ink-secondary)]">
            Pre-release builds looking for critical bugs. Sign the NDA, play,
            report, and earn claim tokens.
          </p>
        </div>

        {campaigns.length === 0 ? (
          <EmptyPanel
            visual="campaigns"
            title="No open playtests right now"
            description="Studios have not published an open campaign yet. Check back soon, or create an account so you are ready when the next build drops."
            action={
              !session ? (
                <Link
                  href="/register"
                  className="inline-flex rounded-full bg-[var(--accent)] px-5 py-2.5 text-[13px] font-semibold text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)]"
                >
                  Create tester account
                </Link>
              ) : (
                <Link
                  href="/me"
                  className="inline-flex rounded-full border border-[var(--line-medium)] px-5 py-2.5 text-[13px] font-semibold text-[var(--ink-primary)] hover:bg-[var(--surface-overlay)]"
                >
                  View my rewards
                </Link>
              )
            }
          />
        ) : (
          <div className="grid gap-4">
            {campaigns.map((c, index) => {
              const studio = (c as unknown as { studio?: { name: string } })
                .studio;

              return (
                <article
                  key={c.id}
                  className="group relative overflow-hidden rounded-[22px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition duration-300 hover:-translate-y-0.5 hover:border-[var(--line-strong)]"
                  style={{
                    animation: `empty-panel-in 480ms cubic-bezier(0.22,1,0.36,1) ${index * 70}ms both`,
                  }}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-100"
                    style={{ background: "var(--accent-wash)" }}
                  />
                  <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink-primary)]">
                          {c.title}
                        </h2>
                        <span className="rounded-full border border-[var(--line-subtle)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink-secondary)]">
                          {c.buildKind}
                        </span>
                      </div>
                      {studio && (
                        <p className="text-xs text-[var(--ink-secondary)]">
                          Studio{" "}
                          <span className="font-medium text-[var(--ink-primary)]">
                            {studio.name}
                          </span>
                        </p>
                      )}
                      <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">
                        {c.pitch}
                      </p>
                      <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-page)]/70 p-3 text-xs text-[var(--ink-secondary)]">
                        <span className="font-semibold uppercase tracking-wider text-[10px] text-[var(--ink-tertiary)]">
                          Test focus
                        </span>
                        <p className="mt-1 text-[var(--ink-primary)]">
                          {c.testFocus}
                        </p>
                      </div>
                    </div>

                    <div className="flex min-w-[180px] flex-col justify-between border-t border-[var(--line-subtle)] pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                      <div className="mb-4 text-right">
                        <div className="text-xs text-[var(--ink-secondary)]">
                          Reward / issue
                        </div>
                        <div className="font-mono text-xl font-semibold tabular-nums text-[var(--ink-primary)]">
                          {c.rewardPerIssue}
                          <span className="ml-1 text-xs font-medium text-[var(--ink-tertiary)]">
                            coins
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--ink-tertiary)]">
                          Pool {c.rewardPoolTotal}
                        </div>
                      </div>
                      <Link
                        href={`/play/${c.id}/nda`}
                        className="rounded-full bg-[var(--accent)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--accent-on-fill)] transition hover:bg-[var(--accent-hover)] active:scale-[0.98]"
                      >
                        Sign NDA & play
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
