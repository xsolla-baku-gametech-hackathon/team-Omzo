"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  CLAIM_REFUSAL_MESSAGE,
  REWARD_KIND_LABEL,
  type ClaimRefusal,
  type ClaimStatus,
  type RewardKind,
} from "@/domain/rewards/catalogue";

export interface ShelfRow {
  id: string;
  kind: RewardKind;
  label: string;
  costCoins: number;
  remaining: number;
  campaignTitle: string;
  /** Coins this tester has with this campaign — what actually pays. */
  campaignBalance: number;
  refusal: ClaimRefusal | null;
  claim: { status: ClaimStatus; code: string | null } | null;
}

const CLAIM_STATUS_NOTE: Record<ClaimStatus, string> = {
  REQUESTED: "Claimed — waiting on the studio",
  FULFILLED: "Sent",
  CANCELLED: "The studio could not supply this. Your coins were returned.",
};

export function RewardShelf(props: { rows: ShelfRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function claim(itemId: string) {
    setBusy(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/rewards/${itemId}/claim`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.message ?? "The claim could not be recorded.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (props.rows.length === 0) {
    return (
      <p className="text-[13px] text-[var(--ink-secondary)]">
        The studios you have joined have not stocked anything yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error !== null && (
        <p role="alert" className="text-[13px] text-[var(--sev-critical)]">
          {error}
        </p>
      )}

      <ul className="border-t border-[var(--line-subtle)] divide-y divide-[var(--line-subtle)]">
        {props.rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[var(--ink-primary)]">
                {row.label}
              </p>
              <p className="text-[12px] text-[var(--ink-secondary)] mt-0.5">
                {REWARD_KIND_LABEL[row.kind]} · {row.campaignTitle} ·{" "}
                {row.remaining} left · you have {row.campaignBalance} here
              </p>
              {row.claim !== null && (
                <p className="text-[12px] text-[var(--ink-secondary)] mt-1">
                  {CLAIM_STATUS_NOTE[row.claim.status]}
                  {row.claim.code !== null && (
                    <>
                      {" "}
                      <span className="font-mono text-[var(--ink-primary)]">
                        {row.claim.code}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[13px] font-mono tabular-nums text-[var(--ink-secondary)]">
                {row.costCoins} coins
              </span>
              {row.claim === null && (
                <button
                  type="button"
                  disabled={busy === row.id || row.refusal !== null}
                  title={
                    row.refusal === null
                      ? undefined
                      : CLAIM_REFUSAL_MESSAGE[row.refusal]
                  }
                  onClick={() => void claim(row.id)}
                  className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-on-fill)] text-[13px] font-medium rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {row.refusal === "insufficient_balance"
                    ? `${row.costCoins - row.campaignBalance} more`
                    : row.refusal === "out_of_stock"
                      ? "None left"
                      : "Claim"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
