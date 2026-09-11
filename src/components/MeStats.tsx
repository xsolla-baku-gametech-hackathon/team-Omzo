"use client";

import { useEffect, useState } from "react";

interface MeStatsProps {
  readonly balance: number;
  readonly signalScore: number;
  readonly issuesFound: number;
}

function AnimatedValue({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value === 0) {
      setDisplay(value);
      return;
    }

    let frame = 0;
    const frames = 28;
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / (frames * 16.6));
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className="tabular-nums font-mono">{display.toLocaleString()}</span>
  );
}

const CARDS = [
  {
    key: "coins" as const,
    label: "Coins",
    hint: "claim tokens",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M12 7.5v9M9.5 10.2c.6-.8 1.5-1.2 2.5-1.2 1.6 0 2.7.8 2.7 2 0 2.4-5.2 1.4-5.2 3.8 0 1.1 1 2 2.6 2 1.1 0 2-.4 2.6-1.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
    accent: "var(--sev-high)",
    wash: "rgba(240, 166, 60, 0.12)",
  },
  {
    key: "signal" as const,
    label: "Signal",
    hint: "report quality",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path
          d="M4 16.5 8.5 12l3 3L20 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.5 7.5H20v4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    accent: "var(--accent-text)",
    wash: "var(--accent-wash)",
  },
  {
    key: "issues" as const,
    label: "Issues",
    hint: "verified finds",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path
          d="M12 3.8 20.2 18.5H3.8L12 3.8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M12 9.5v4.2M12 16.2h.01"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
    accent: "var(--state-verified)",
    wash: "var(--state-verified-wash)",
  },
];

export function MeStats({
  balance,
  signalScore,
  issuesFound,
}: MeStatsProps) {
  const values = {
    coins: balance,
    signal: signalScore,
    issues: issuesFound,
  };

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {CARDS.map((card, index) => (
        <div
          key={card.key}
          className="group relative overflow-hidden rounded-[22px] border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.22)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5"
          style={{ animationDelay: `${index * 80}ms` }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-80 blur-2xl transition-opacity group-hover:opacity-100"
            style={{ background: card.wash }}
          />
          <div className="relative flex items-start justify-between gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-2xl"
              style={{ background: card.wash, color: card.accent }}
            >
              {card.icon}
            </div>
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
              {card.hint}
            </span>
          </div>
          <div className="relative mt-5 text-[34px] font-semibold tracking-[-0.03em] text-[var(--ink-primary)]">
            <AnimatedValue value={values[card.key]} />
          </div>
          <p className="relative mt-1 text-[13px] text-[var(--ink-secondary)]">
            {card.label}
          </p>
        </div>
      ))}
    </div>
  );
}
