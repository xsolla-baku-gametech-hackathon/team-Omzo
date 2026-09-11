"use client";

import { useCallback, useEffect, useState } from "react";

interface Applicant {
  readonly id: string;
  readonly status: string;
  readonly message: string | null;
  readonly createdAt: string;
  readonly tester: {
    readonly id: string;
    readonly displayName: string;
    readonly signalScore: number;
    readonly trustLevel: number;
    readonly trustTier: string;
    readonly verifiedIssues: number;
  };
}

export function ApplicantsPanel({
  campaignId,
  buildKind,
}: {
  readonly campaignId: string;
  readonly buildKind: string;
}) {
  const [applications, setApplications] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/applications`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to load applicants.");
      }
      setApplications(data.applications ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (buildKind !== "DOWNLOAD") return;
    void load();
  }, [buildKind, load]);

  if (buildKind !== "DOWNLOAD") {
    return null;
  }

  async function decide(appId: string, action: "approve" | "deny") {
    setBusyId(appId);
    setError(null);
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/applications/${appId}/${action}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Failed to ${action}.`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = applications.filter((a) => a.status === "PENDING");
  const resolved = applications.filter((a) => a.status !== "PENDING");

  return (
    <section className="mb-6 rounded-[18px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink-primary)]">
            Applicants
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">
            Trust level and verified finds help you decide who gets the
            download.
          </p>
        </div>
        <span className="font-mono text-xs text-[var(--ink-tertiary)]">
          {pending.length} pending
        </span>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--ink-tertiary)]">Loading…</p>
      ) : applications.length === 0 ? (
        <p className="text-xs text-[var(--ink-secondary)]">
          No applications yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {[...pending, ...resolved].map((app) => (
            <li
              key={app.id}
              className="flex flex-col gap-3 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-page)]/60 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[var(--ink-primary)]">
                    {app.tester.displayName}
                  </span>
                  <span className="rounded-full border border-[var(--line-subtle)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-secondary)]">
                    Lvl {app.tester.trustLevel} · {app.tester.trustTier}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--ink-tertiary)]">
                    {app.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[var(--ink-secondary)]">
                  Signal {app.tester.signalScore} · {app.tester.verifiedIssues}{" "}
                  verified · applied{" "}
                  {new Date(app.createdAt).toLocaleString()}
                </p>
                {app.message && (
                  <p className="mt-1 text-[11px] text-[var(--ink-tertiary)]">
                    {app.message}
                  </p>
                )}
              </div>
              {app.status === "PENDING" && (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === app.id}
                    onClick={() => void decide(app.id, "approve")}
                    className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-on-fill)] disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === app.id}
                    onClick={() => void decide(app.id, "deny")}
                    className="rounded-full border border-[var(--line-medium)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-secondary)] disabled:opacity-60"
                  >
                    Deny
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-3 text-xs text-[var(--sev-critical)]">{error}</p>
      )}
    </section>
  );
}
