"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

const KIND_META: Record<
  RewardKind,
  { icon: string; wash: string; accent: string }
> = {
  CREDITS_MENTION: {
    icon: "✦",
    wash: "var(--accent-wash)",
    accent: "var(--accent-text)",
  },
  EARLY_ACCESS: {
    icon: "◇",
    wash: "var(--state-verified-wash)",
    accent: "var(--state-verified)",
  },
  ITEM_CODE: {
    icon: "▣",
    wash: "rgba(240, 166, 60, 0.12)",
    accent: "var(--sev-high)",
  },
  STEAM_KEY: {
    icon: "◎",
    wash: "rgba(255, 107, 74, 0.12)",
    accent: "var(--sev-critical)",
  },
};

function CoinBadge({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-subtle)] bg-[var(--surface-page)] px-2.5 py-1 font-mono text-[12px] font-semibold tabular-nums text-[var(--ink-primary)]">
      <span
        aria-hidden
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
        style={{
          background: "rgba(240, 166, 60, 0.18)",
          color: "var(--sev-high)",
        }}
      >
        ¢
      </span>
      {amount}
    </span>
  );
}

function KindIcon({ kind }: { kind: RewardKind }) {
  const meta = KIND_META[kind];
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[15px] font-semibold transition-transform duration-300 group-hover:scale-105"
      style={{ background: meta.wash, color: meta.accent }}
    >
      {meta.icon}
    </span>
  );
}

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
  const [ready, setReady] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setReady(true);
      return;
    }
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 900);
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
  const kindMeta = KIND_META[kind];

  const enter = (delayMs: number) =>
    ready
      ? {
          opacity: 1,
          transform: "translateY(0)",
          transition: `opacity 500ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms, transform 500ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms`,
        }
      : {
          opacity: 0,
          transform: "translateY(12px)",
        };

  return (
    <div className="space-y-10">
      {error !== null && (
        <p
          role="alert"
          className="rounded-2xl border border-[var(--sev-critical)]/25 bg-[var(--sev-critical-wash)] px-4 py-3 text-[13px] text-[var(--sev-critical)]"
        >
          {error}
        </p>
      )}

      <section style={enter(40)}>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[length:var(--type-heading-size)] font-semibold tracking-[-0.02em] text-[var(--ink-primary)]">
              Claims waiting on you
            </h2>
            <p className="mt-2 max-w-[var(--body-measure)] text-[13px] leading-relaxed text-[var(--ink-secondary)]">
              Paste the code you already own. Repro never generates or holds
              one — fulfilment is yours, and the coins are already spent either
              way.
            </p>
          </div>
          {open.length > 0 && (
            <span className="shrink-0 rounded-full bg-[var(--sev-high)]/15 px-2.5 py-1 text-[11px] font-semibold text-[var(--sev-high)]">
              {open.length} open
            </span>
          )}
        </div>

        {open.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-[var(--line-medium)] bg-[var(--surface-raised)]/60 px-5 py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--ink-tertiary)]">
              ✓
            </div>
            <p className="text-[14px] font-medium text-[var(--ink-primary)]">
              Inbox clear
            </p>
            <p className="mt-1 text-[13px] text-[var(--ink-tertiary)]">
              New claims will appear here when testers spend coins.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {open.map((claim, index) => (
              <li
                key={claim.id}
                className="group overflow-hidden rounded-[22px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition-transform duration-300 hover:-translate-y-0.5"
                style={enter(80 + index * 60)}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <KindIcon kind={claim.itemKind} />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-[var(--ink-primary)]">
                        {claim.testerName}
                      </p>
                      <p className="truncate text-[12px] text-[var(--ink-secondary)]">
                        {claim.itemLabel} · {REWARD_KIND_LABEL[claim.itemKind]}
                      </p>
                    </div>
                  </div>
                  <CoinBadge amount={claim.costCoins} />
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
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
                    className="flex-1 rounded-xl border border-[var(--line-medium)] bg-[var(--surface-page)] px-3.5 py-2.5 font-mono text-[13px] text-[var(--ink-primary)] outline-none transition focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-wash)]"
                  />
                  <button
                    type="button"
                    disabled={
                      busy === claim.id ||
                      (codes[claim.id] ?? "").trim().length === 0
                    }
                    onClick={() => void resolve(claim.id, "fulfil")}
                    className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-[13px] font-semibold text-[var(--accent-on-fill)] transition hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:opacity-40"
                  >
                    Send
                  </button>
                  <button
                    type="button"
                    disabled={busy === claim.id}
                    onClick={() => void resolve(claim.id, "cancel")}
                    className="rounded-full border border-[var(--line-medium)] px-4 py-2.5 text-[13px] text-[var(--ink-secondary)] transition hover:text-[var(--ink-primary)] disabled:opacity-40"
                  >
                    Refund
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={enter(140)}>
        <div className="mb-4">
          <h2 className="text-[length:var(--type-heading-size)] font-semibold tracking-[-0.02em] text-[var(--ink-primary)]">
            The shelf
          </h2>
          <p className="mt-2 max-w-[var(--body-measure)] text-[13px] text-[var(--ink-secondary)]">
            Stock rewards testers can claim with coins earned from verified
            issues.
          </p>
        </div>

        {props.items.length > 0 && (
          <ul className="mb-5 grid gap-3 sm:grid-cols-2">
            {props.items.map((item, index) => {
              const filled =
                item.totalStock === 0
                  ? 0
                  : Math.round((item.claimedCount / item.totalStock) * 100);
              return (
                <li
                  key={item.id}
                  className="group relative overflow-hidden rounded-[22px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-4 transition-transform duration-300 hover:-translate-y-0.5"
                  style={enter(180 + index * 50)}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-70 blur-2xl"
                    style={{ background: KIND_META[item.kind].wash }}
                  />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <KindIcon kind={item.kind} />
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-[var(--ink-primary)]">
                          {item.label}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--ink-tertiary)]">
                          {REWARD_KIND_LABEL[item.kind]} · costs you{" "}
                          {REWARD_KIND_COST_TO_STUDIO[item.kind].toLowerCase()}
                        </p>
                      </div>
                    </div>
                    <CoinBadge amount={item.costCoins} />
                  </div>
                  <div className="relative mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--ink-secondary)]">
                      <span>
                        {item.remaining} of {item.totalStock} left
                      </span>
                      <span className="font-mono tabular-nums">{filled}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{
                          width: `${filled}%`,
                          background: KIND_META[item.kind].accent,
                        }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form
          onSubmit={(event) => void addItem(event)}
          className={`relative overflow-hidden rounded-[24px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.22)] transition-shadow duration-500 ${
            justAdded ? "shadow-[0_0_0_1px_var(--state-verified),0_16px_48px_rgba(0,0,0,0.22)]" : ""
          }`}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-80"
            style={{
              background: `radial-gradient(ellipse 60% 100% at 20% 0%, ${kindMeta.wash}, transparent 70%)`,
            }}
          />

          <div className="relative mb-4 flex flex-wrap items-center gap-2">
            {REWARD_KINDS.map((option) => {
              const active = kind === option;
              const meta = KIND_META[option];
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all duration-300 ${
                    active
                      ? "text-[var(--ink-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
                      : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                  }`}
                  style={
                    active
                      ? {
                          background: "var(--surface-overlay)",
                          boxShadow: `inset 0 0 0 1px ${meta.accent}33`,
                        }
                      : { background: "var(--surface-sunken)" }
                  }
                >
                  <span style={{ color: meta.accent }}>{meta.icon}</span>
                  {REWARD_KIND_LABEL[option]}
                </button>
              );
            })}
          </div>

          <p className="relative mb-4 text-[12px] text-[var(--ink-secondary)]">
            Costs you{" "}
            <span className="font-medium text-[var(--ink-primary)]">
              {REWARD_KIND_COST_TO_STUDIO[kind].toLowerCase()}
            </span>
          </p>

          <div className="relative grid gap-3 sm:grid-cols-[1fr_7.5rem_6.5rem_auto]">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-tertiary)]">
                Label
              </span>
              <input
                type="text"
                required
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Steam key — Deepfall"
                className="w-full rounded-xl border border-[var(--line-medium)] bg-[var(--surface-page)] px-3.5 py-2.5 text-[13px] text-[var(--ink-primary)] outline-none transition focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-wash)]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-tertiary)]">
                Coins
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-[var(--sev-high)]">
                  ¢
                </span>
                <input
                  type="number"
                  min={1}
                  required
                  value={costCoins}
                  onChange={(event) => setCostCoins(Number(event.target.value))}
                  aria-label="Cost in coins"
                  className="w-full rounded-xl border border-[var(--line-medium)] bg-[var(--surface-page)] py-2.5 pl-7 pr-3 font-mono text-[13px] text-[var(--ink-primary)] outline-none transition focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-wash)]"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-tertiary)]">
                Stock
              </span>
              <input
                type="number"
                min={1}
                required
                value={totalStock}
                onChange={(event) => setTotalStock(Number(event.target.value))}
                aria-label="Stock"
                className="w-full rounded-xl border border-[var(--line-medium)] bg-[var(--surface-page)] px-3 py-2.5 font-mono text-[13px] text-[var(--ink-primary)] outline-none transition focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-wash)]"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy === "add"}
                className="w-full rounded-full bg-[var(--accent)] px-5 py-2.5 text-[13px] font-semibold text-[var(--accent-on-fill)] shadow-[0_8px_24px_var(--accent-glow)] transition hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:opacity-40 sm:w-auto"
              >
                {busy === "add" ? "Adding…" : justAdded ? "Added" : "Add to shelf"}
              </button>
            </div>
          </div>
        </form>
      </section>

      {resolved.length > 0 && (
        <section style={enter(220)}>
          <h2 className="text-[length:var(--type-heading-size)] font-semibold tracking-[-0.02em] text-[var(--ink-primary)]">
            Resolved
          </h2>
          <ul className="mt-4 space-y-2">
            {resolved.map((claim) => (
              <li
                key={claim.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-raised)]/70 px-4 py-3 text-[13px]"
              >
                <span className="text-[var(--ink-secondary)]">
                  {claim.testerName} — {claim.itemLabel}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    claim.status === "FULFILLED"
                      ? "bg-[var(--state-verified-wash)] text-[var(--state-verified)]"
                      : "bg-[var(--surface-sunken)] text-[var(--ink-tertiary)]"
                  }`}
                >
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
