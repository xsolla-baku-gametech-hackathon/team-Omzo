import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyPanel } from "@/components/EmptyPanel";
import { getStudioCampaigns } from "@/server/services/campaignService";
import { getSession } from "@/server/session";

export default async function StudioDashboardPage() {
  const session = await getSession();
  if (!session || session.role !== "STUDIO" || !session.studioId) {
    redirect("/login");
  }

  const campaigns = await getStudioCampaigns(session.studioId);

  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--ink-primary)] font-sans">
      <header className="border-b border-[var(--line-subtle)] bg-[var(--surface-raised)]/90 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-[var(--ink-primary)]"
            >
              Repro
            </Link>
            <span className="text-[var(--line-subtle)]">/</span>
            <span className="text-sm font-medium text-[var(--ink-secondary)]">
              Studio
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-[var(--ink-secondary)] sm:inline">
              {session.displayName}
            </span>
            <Link
              href="/studio/billing"
              className="text-[length:var(--type-meta-size)] text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
            >
              Billing
            </Link>
            <Link
              href="/studio/new"
              className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)]"
            >
              + New campaign
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 py-8">
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full opacity-50 blur-3xl"
          style={{ background: "var(--accent-wash)" }}
        />

        <div className="relative mb-8">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink-primary)]">
            Campaigns
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-secondary)]">
            Active and archived technical playtests.
          </p>
        </div>

        {campaigns.length === 0 ? (
          <EmptyPanel
            visual="campaigns"
            title="No campaigns yet"
            description="Create your first campaign to distribute a build, collect reports, and collapse them into issues your team can fix."
            action={
              <Link
                href="/studio/new"
                className="inline-flex rounded-full bg-[var(--accent)] px-5 py-2.5 text-[13px] font-semibold text-[var(--accent-on-fill)] shadow-[0_8px_24px_var(--accent-glow)] hover:bg-[var(--accent-hover)]"
              >
                Create campaign
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4">
            {campaigns.map((c, index) => {
              const counts = (
                c as unknown as {
                  _count?: {
                    reports: number;
                    issues: number;
                    accessGrants: number;
                  };
                }
              )._count;
              const isRevoked = c.revokedAt !== null;

              return (
                <article
                  key={c.id}
                  className="group relative overflow-hidden rounded-[22px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.16)] transition duration-300 hover:-translate-y-0.5 hover:border-[var(--line-strong)]"
                  style={{
                    animation: `empty-panel-in 480ms cubic-bezier(0.22,1,0.36,1) ${index * 70}ms both`,
                  }}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-[var(--ink-primary)]">
                          {c.title}
                        </h2>
                        {isRevoked ? (
                          <span className="rounded-full bg-[var(--sev-critical-wash)] px-2 py-0.5 text-[11px] font-medium text-[var(--sev-critical)]">
                            Revoked
                          </span>
                        ) : c.status === "OPEN" ? (
                          <span className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-text)]">
                            Open
                          </span>
                        ) : (
                          <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-secondary)]">
                            {c.status}
                          </span>
                        )}
                      </div>
                      <p className="max-w-xl text-xs text-[var(--ink-secondary)] line-clamp-2">
                        {c.pitch}
                      </p>
                      <p className="pt-1 text-xs text-[var(--ink-secondary)]">
                        Focus:{" "}
                        <span className="text-[var(--ink-primary)]">
                          {c.testFocus}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-5 border-t border-[var(--line-subtle)] pt-4 md:border-t-0 md:pt-0">
                      {[
                        ["Issues", counts?.issues ?? 0],
                        ["Reports", counts?.reports ?? 0],
                        ["Testers", counts?.accessGrants ?? 0],
                      ].map(([label, value]) => (
                        <div key={label as string} className="text-center">
                          <div className="font-mono text-xl font-semibold tabular-nums text-[var(--ink-primary)]">
                            {value as number}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-secondary)]">
                            {label as string}
                          </div>
                        </div>
                      ))}
                      <Link
                        href={`/studio/${c.id}`}
                        className="rounded-full border border-[var(--line-medium)] px-3 py-2 text-xs font-semibold transition hover:bg-[var(--surface-overlay)]"
                      >
                        View board
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
