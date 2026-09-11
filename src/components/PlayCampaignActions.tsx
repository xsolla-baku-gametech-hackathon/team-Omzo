"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type PlayCtaState =
  | "sign_in"
  | "apply"
  | "pending"
  | "denied"
  | "sign_nda"
  | "enter"
  | "closed"
  | "open";

interface PlayCampaignActionsProps {
  readonly campaignId: string;
  readonly buildKind: string;
  readonly state: PlayCtaState;
  readonly applicationClosesAt?: string;
  readonly testingEndsAt?: string;
}

export function PlayCampaignActions({
  campaignId,
  buildKind,
  state,
  applicationClosesAt,
  testingEndsAt,
}: PlayCampaignActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not submit application.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed.");
    } finally {
      setLoading(false);
    }
  }

  const chip =
    buildKind === "DOWNLOAD" ? (
      <p className="mb-2 text-[11px] text-[var(--ink-tertiary)]">
        {state === "closed"
          ? testingEndsAt
            ? `Testing ended ${new Date(testingEndsAt).toLocaleDateString()}`
            : "Window closed"
          : applicationClosesAt
            ? `Apply by ${new Date(applicationClosesAt).toLocaleDateString()}`
            : null}
      </p>
    ) : null;

  if (state === "sign_in") {
    return (
      <div>
        {chip}
        <Link
          href={`/login?redirect=/play`}
          className="block rounded-full bg-[var(--accent)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--accent-on-fill)] transition hover:bg-[var(--accent-hover)]"
        >
          Sign in to continue
        </Link>
      </div>
    );
  }

  if (state === "apply" || state === "denied") {
    return (
      <div>
        {chip}
        {state === "denied" && (
          <p className="mb-2 text-[11px] text-[var(--sev-high)]">
            Previous application denied — you may apply again.
          </p>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={() => void apply()}
          className="w-full rounded-full bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-[var(--accent-on-fill)] transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {loading ? "Applying…" : "Apply for access"}
        </button>
        {error && (
          <p className="mt-2 text-[11px] text-[var(--sev-critical)]">{error}</p>
        )}
      </div>
    );
  }

  if (state === "pending") {
    return (
      <div>
        {chip}
        <div className="rounded-full border border-[var(--line-medium)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--ink-secondary)]">
          Pending studio review
        </div>
      </div>
    );
  }

  if (state === "closed") {
    return (
      <div>
        {chip}
        <div className="rounded-full border border-[var(--line-subtle)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--ink-tertiary)]">
          Closed
        </div>
      </div>
    );
  }

  if (state === "sign_nda") {
    return (
      <div>
        {chip}
        <Link
          href={`/play/${campaignId}/nda`}
          className="block rounded-full bg-[var(--accent)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--accent-on-fill)] transition hover:bg-[var(--accent-hover)]"
        >
          Approved — Sign NDA
        </Link>
      </div>
    );
  }

  return (
    <div>
      {chip}
      <Link
        href={`/play/${campaignId}/nda`}
        className="block rounded-full bg-[var(--accent)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--accent-on-fill)] transition hover:bg-[var(--accent-hover)] active:scale-[0.98]"
      >
        {state === "enter" ? "Enter playtest" : "Sign NDA & play"}
      </Link>
    </div>
  );
}
