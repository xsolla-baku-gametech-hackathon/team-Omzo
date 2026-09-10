import Link from "next/link";
import { redirect } from "next/navigation";

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
      {/* Header */}
      <header className="border-b border-[var(--line-subtle)] bg-[var(--surface-raised)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-semibold text-lg tracking-tight text-[var(--ink-primary)]"
            >
              Repro
            </Link>
            <span className="text-[var(--line-subtle)]">/</span>
            <span className="text-sm font-medium text-[var(--ink-secondary)]">
              Studio Dashboard
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[var(--ink-secondary)] hidden sm:inline">
              {session.displayName}
            </span>
            <Link
              href="/studio/new"
              className="py-1.5 px-3 bg-[var(--accent)] text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)] text-xs font-medium rounded-[var(--radius-sm)] transition-opacity"
            >
              + New Campaign
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink-primary)]">
              Campaigns
            </h1>
            <p className="text-sm text-[var(--ink-secondary)] mt-1">
              Active and archived technical playtests.
            </p>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className="border border-dashed border-[var(--line-subtle)] p-12 text-center rounded-[var(--radius-md)] bg-[var(--surface-sunken)]">
            <h3 className="text-base font-medium text-[var(--ink-primary)]">
              No campaigns created yet
            </h3>
            <p className="text-sm text-[var(--ink-secondary)] mt-1 max-w-sm mx-auto">
              Create your first campaign to distribute your build to testers and
              start collecting triaged reports.
            </p>
            <Link
              href="/studio/new"
              className="inline-block mt-4 py-2 px-4 bg-[var(--accent)] text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)] text-xs font-medium rounded-[var(--radius-sm)]"
            >
              Create Campaign
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {campaigns.map((c) => {
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
                <div
                  key={c.id}
                  className="border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-6 rounded-[var(--radius-md)] flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:border-[var(--line-strong)] transition-colors shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-[var(--ink-primary)]">
                        {c.title}
                      </h2>
                      {isRevoked ? (
                        <span className="text-[11px] px-2 py-0.5 bg-[var(--sev-critical-wash)] text-[var(--sev-critical)] font-medium rounded-[var(--radius-sm)]">
                          Revoked
                        </span>
                      ) : c.status === "OPEN" ? (
                        <span className="text-[11px] px-2 py-0.5 bg-[var(--accent-wash)] text-[var(--accent)] font-medium rounded-[var(--radius-sm)]">
                          Open
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 bg-[var(--surface-sunken)] text-[var(--ink-secondary)] font-medium rounded-[var(--radius-sm)]">
                          {c.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--ink-secondary)] max-w-xl line-clamp-2">
                      {c.pitch}
                    </p>
                    <div className="text-xs text-[var(--ink-secondary)] pt-1">
                      Focus:{" "}
                      <span className="text-[var(--ink-primary)]">
                        {c.testFocus}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 border-t md:border-t-0 border-[var(--line-subtle)] pt-4 md:pt-0">
                    <div className="text-center">
                      <div className="text-xl font-semibold tracking-tight font-mono text-[var(--ink-primary)]">
                        {counts?.issues ?? 0}
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-[var(--ink-secondary)]">
                        Issues
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-semibold tracking-tight text-[var(--ink-secondary)] font-mono">
                        {counts?.reports ?? 0}
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-[var(--ink-secondary)]">
                        Reports
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-semibold tracking-tight text-[var(--ink-secondary)] font-mono">
                        {counts?.accessGrants ?? 0}
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-[var(--ink-secondary)]">
                        Testers
                      </div>
                    </div>

                    <Link
                      href={`/studio/${c.id}`}
                      className="py-2 px-3 border border-[var(--line-subtle)] hover:border-[var(--line-strong)] text-xs font-medium rounded-[var(--radius-sm)] transition-colors"
                    >
                      View Board
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
