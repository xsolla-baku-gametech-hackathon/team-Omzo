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
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-hairline bg-raised px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold text-lg tracking-tight">
              Repro
            </Link>
            <span className="text-hairline">/</span>
            <span className="text-sm font-medium text-slate">
              Studio Dashboard
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate">{session.displayName}</span>
            <Link
              href="/studio/new"
              className="py-1.5 px-3 bg-ink text-paper text-xs font-medium rounded-sm hover:opacity-90 transition-opacity"
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
            <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
            <p className="text-sm text-slate mt-1">
              Active and archived technical playtests.
            </p>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className="border border-dashed border-hairline p-12 text-center rounded-sm bg-raised/50">
            <h3 className="text-base font-medium">No campaigns created yet</h3>
            <p className="text-sm text-slate mt-1 max-w-sm mx-auto">
              Create your first campaign to distribute your build to testers and
              start collecting triaged reports.
            </p>
            <Link
              href="/studio/new"
              className="inline-block mt-4 py-2 px-4 bg-ink text-paper text-xs font-medium rounded-sm hover:opacity-90"
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
                  className="border border-hairline bg-raised p-6 rounded-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold">{c.title}</h2>
                      {isRevoked ? (
                        <span className="text-[11px] px-2 py-0.5 bg-red-100 text-red-700 font-medium rounded-xs">
                          Revoked
                        </span>
                      ) : c.status === "OPEN" ? (
                        <span className="text-[11px] px-2 py-0.5 bg-teal-100 text-teal-800 font-medium rounded-xs">
                          Open
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 bg-gray-200 text-slate font-medium rounded-xs">
                          {c.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate max-w-xl line-clamp-2">
                      {c.pitch}
                    </p>
                    <div className="text-xs text-slate/80 pt-1">
                      Focus: <span className="text-ink">{c.testFocus}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 border-t md:border-t-0 border-hairline pt-4 md:pt-0">
                    <div className="text-center">
                      <div className="text-xl font-semibold tracking-tight">
                        {counts?.issues ?? 0}
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-slate">
                        Issues
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-semibold tracking-tight text-slate">
                        {counts?.reports ?? 0}
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-slate">
                        Reports
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-semibold tracking-tight text-slate">
                        {counts?.accessGrants ?? 0}
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-slate">
                        Testers
                      </div>
                    </div>

                    <Link
                      href={`/studio/${c.id}`}
                      className="py-2 px-3 border border-hairline hover:border-ink text-xs font-medium rounded-sm transition-colors"
                    >
                      View Board →
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
