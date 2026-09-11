"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  REWARD_KINDS,
  REWARD_KIND_COST_TO_STUDIO,
  REWARD_KIND_LABEL,
  type RewardKind,
} from "@/domain/rewards/catalogue";

export interface ShelfItem {
  id: string;
  kind: RewardKind;
  label: string;
  costCoins: number;
  totalStock: number;
  claimedCount: number;
  remaining: number;
}

export interface ClaimRow {
  id: string;
  status: "REQUESTED" | "FULFILLED" | "CANCELLED";
  code: string | null;
  createdAt: string;
  testerName: string;
  itemLabel: string;
  itemKind: RewardKind;
  costCoins: number;
}

const STATUS_LABEL: Record<ClaimRow["status"], string> = {
  REQUESTED: "Waiting on you",
  FULFILLED: "Sent",
  CANCELLED: "Refunded",
};

export function RewardShelfManager(props: {
  campaignId: string;
  items: ShelfItem[];
  claims: ClaimRow[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<RewardKind>("CREDITS_MENTION");
  const [label, setLabel] = useState("");
  const [costCoins, setCostCoins] = useState(200);
  const [totalStock, setTotalStock] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    setBusy("add");
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${props.campaignId}/rewards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, label, costCoins, totalStock }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.message ?? "The reward could not be saved.");
        return;
      }
      setLabel("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function resolve(claimId: string, action: "fulfil" | "cancel") {
    setBusy(claimId);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claimId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          action === "fulfil"
            ? JSON.stringify({ code: codes[claimId] ?? "" })
            : undefined,
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.message ?? "The claim could not be resolved.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const open = props.claims.filter((claim) => claim.status === "REQUESTED");
  const resolved = props.claims.filter((claim) => claim.status !== "REQUESTED");

  return (
    <div className="space-y-[var(--space-10)]">
      {error !== null && (
        <p className="text-[13px] text-[var(--sev-critical)]">{error}</p>
      )}

      <section>
        <h2 className="text-[length:var(--type-heading-size)] font-[550] text-[var(--ink-primary)]">
          Claims waiting on you
        </h2>
        <p className="mt-[var(--space-2)] max-w-[var(--body-measure)] text-[13px] text-[var(--ink-secondary)]">
          Paste the code you already own. Repro never generates or holds one —
          fulfilment is yours, and the coins are already spent either way.
        </p>

        {open.length === 0 ? (
          <p className="mt-[var(--space-4)] text-[13px] text-[var(--ink-tertiary)]">
            Nothing waiting.
          </p>
        ) : (
          <ul className="mt-[var(--space-4)] space-y-[var(--space-3)]">
            {open.map((claim) => (
              <li
                key={claim.id}
                className="border border-[var(--line-subtle)] bg-[var(--surface-raised)] rounded-[var(--radius-sm)] p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-[var(--ink-primary)]">
                    {claim.testerName} — {claim.itemLabel}
                  </span>
                  <span className="text-[12px] font-mono text-[var(--ink-secondary)]">
                    {claim.costCoins} coins
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={codes[claim.id] ?? ""}
                    onChange={(event) =>
                      setCodes((prev) => ({
                        ...prev,
                        [claim.id]: event.target.value,
                      }))
                    }
                    placeholder="Paste the key or code"
                    className="flex-1 px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[13px] font-mono text-[var(--ink-primary)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    disabled={
                      busy === claim.id ||
                      (codes[claim.id] ?? "").trim().length === 0
                    }
                    onClick={() => void resolve(claim.id, "fulfil")}
                    className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-on-fill)] text-[13px] font-medium rounded-[var(--radius-sm)] disabled:opacity-40"
                  >
                    Send
                  </button>
                  <button
                    type="button"
                    disabled={busy === claim.id}
                    onClick={() => void resolve(claim.id, "cancel")}
                    className="px-4 py-2 border border-[var(--line-subtle)] text-[var(--ink-secondary)] text-[13px] rounded-[var(--radius-sm)] hover:text-[var(--ink-primary)] disabled:opacity-40"
                  >
                    Cannot supply — refund
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[length:var(--type-heading-size)] font-[550] text-[var(--ink-primary)]">
          The shelf
        </h2>
        {props.items.length > 0 && (
          <ul className="mt-[var(--space-4)] space-y-[var(--space-2)]">
            {props.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line-subtle)] pb-2 text-[13px]"
              >
                <span className="text-[var(--ink-primary)]">
                  {item.label}
                  <span className="ml-2 text-[11px] text-[var(--ink-tertiary)]">
                    {REWARD_KIND_LABEL[item.kind]} · costs you{" "}
                    {REWARD_KIND_COST_TO_STUDIO[item.kind].toLowerCase()}
                  </span>
                </span>
                <span className="font-mono text-[var(--ink-secondary)]">
                  {item.costCoins} coins · {item.remaining} of {item.totalStock}{" "}
                  left
                </span>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(event) => void addItem(event)}
          className="mt-[var(--space-6)] grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]"
        >
          <div className="sm:col-span-4">
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as RewardKind)}
              className="px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[13px] text-[var(--ink-primary)] rounded-[var(--radius-sm)]"
            >
              {REWARD_KINDS.map((option) => (
                <option key={option} value={option}>
                  {REWARD_KIND_LABEL[option]} — costs you{" "}
                  {REWARD_KIND_COST_TO_STUDIO[option].toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            required
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Steam key — Deepfall"
            className="px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[13px] text-[var(--ink-primary)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)]"
          />
          <input
            type="number"
            min={1}
            required
            value={costCoins}
            onChange={(event) => setCostCoins(Number(event.target.value))}
            aria-label="Cost in coins"
            className="w-28 px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[13px] font-mono text-[var(--ink-primary)] rounded-[var(--radius-sm)]"
          />
          <input
            type="number"
            min={1}
            required
            value={totalStock}
            onChange={(event) => setTotalStock(Number(event.target.value))}
            aria-label="Stock"
            className="w-24 px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[13px] font-mono text-[var(--ink-primary)] rounded-[var(--radius-sm)]"
          />
          <button
            type="submit"
            disabled={busy === "add"}
            className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-on-fill)] text-[13px] font-medium rounded-[var(--radius-sm)] disabled:opacity-40"
          >
            Add
          </button>
        </form>
      </section>

      {resolved.length > 0 && (
        <section>
          <h2 className="text-[length:var(--type-heading-size)] font-[550] text-[var(--ink-primary)]">
            Resolved
          </h2>
          <ul className="mt-[var(--space-4)] space-y-[var(--space-2)] text-[13px]">
            {resolved.map((claim) => (
              <li
                key={claim.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line-subtle)] pb-2"
              >
                <span className="text-[var(--ink-secondary)]">
                  {claim.testerName} — {claim.itemLabel}
                </span>
                <span className="text-[11px] font-mono text-[var(--ink-tertiary)]">
                  {STATUS_LABEL[claim.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
