"use client";

import type { ReactNode } from "react";

type EmptyVisual = "radar" | "stream" | "shelf" | "campaigns" | "inbox";

interface EmptyPanelProps {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly visual?: EmptyVisual;
  readonly className?: string;
  /** When true, keep Console left-align (no centered marketing empty). */
  readonly align?: "center" | "start";
}

function Visual({ kind }: { kind: EmptyVisual }) {
  if (kind === "stream") {
    return (
      <div
        aria-hidden
        className="mx-auto mb-5 w-full max-w-[220px] space-y-2 opacity-80"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-page)]/70 px-3 py-2"
            style={{
              animation: `empty-row-in 700ms cubic-bezier(0.22,1,0.36,1) ${i * 120}ms both`,
            }}
          >
            <span className="h-1.5 w-8 rounded-full bg-[var(--line-medium)]" />
            <span
              className="h-1.5 flex-1 rounded-full bg-[var(--line-subtle)]"
              style={{
                animation: `empty-shimmer 1.8s ease-in-out ${i * 180}ms infinite`,
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (kind === "shelf") {
    return (
      <div aria-hidden className="relative mx-auto mb-5 h-16 w-16">
        <div className="absolute inset-0 rounded-2xl border border-[var(--line-medium)] bg-[var(--surface-page)]" />
        <div
          className="absolute inset-2 rounded-xl"
          style={{
            background: "rgba(240,166,60,0.12)",
            animation: "empty-pulse 2.2s ease-in-out infinite",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-[18px] font-bold text-[var(--sev-high)]">
          ¢
        </div>
      </div>
    );
  }

  if (kind === "campaigns") {
    return (
      <div aria-hidden className="relative mx-auto mb-5 h-16 w-24">
        <div className="absolute left-0 top-3 h-10 w-16 rounded-xl border border-[var(--line-medium)] bg-[var(--surface-page)]" />
        <div
          className="absolute right-0 top-0 h-12 w-16 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-wash)]"
          style={{ animation: "empty-float 2.4s ease-in-out infinite" }}
        />
        <div className="absolute bottom-0 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-[var(--line-subtle)]" />
      </div>
    );
  }

  if (kind === "inbox") {
    return (
      <div
        aria-hidden
        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--state-verified)]/30 bg-[var(--state-verified-wash)] text-[var(--state-verified)]"
        style={{ animation: "empty-pulse 2.4s ease-in-out infinite" }}
      >
        ✓
      </div>
    );
  }

  // radar (default / board waiting)
  return (
    <div aria-hidden className="relative mx-auto mb-5 h-16 w-16">
      <span
        className="absolute inset-0 rounded-full border border-[var(--accent)]/25"
        style={{ animation: "empty-ring 2.4s ease-out infinite" }}
      />
      <span
        className="absolute inset-2 rounded-full border border-[var(--accent)]/20"
        style={{ animation: "empty-ring 2.4s ease-out 0.4s infinite" }}
      />
      <span className="absolute inset-[22px] rounded-full bg-[var(--accent)] shadow-[0_0_16px_var(--accent-glow)]" />
    </div>
  );
}

export function EmptyPanel({
  title,
  description,
  action,
  visual = "radar",
  className = "",
  align = "center",
}: EmptyPanelProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-[24px] border border-dashed border-[var(--line-medium)] bg-[var(--surface-raised)]/70 px-6 py-10 ${
        align === "center" ? "text-center" : "text-left"
      } ${className}`}
      style={{ animation: "empty-panel-in 480ms cubic-bezier(0.22,1,0.36,1) both" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-70 blur-3xl"
        style={{ background: "var(--accent-wash)" }}
      />
      <div className="relative">
        <Visual kind={visual} />
        <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--ink-primary)]">
          {title}
        </h3>
        <p
          className={`mt-2 text-[13px] leading-relaxed text-[var(--ink-secondary)] ${
            align === "center" ? "mx-auto max-w-md" : "max-w-[68ch]"
          }`}
        >
          {description}
        </p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}
