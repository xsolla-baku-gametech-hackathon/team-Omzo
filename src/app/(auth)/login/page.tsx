"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to log in.");
      }

      // A hard navigation, not router.push: the session cookie just changed,
      // and a client-side transition can hit a stale chunk for a route the
      // browser hadn't loaded yet, leaving the user stuck on this form with
      // no visible error. A full navigation always fetches the current build.
      window.location.href = data.user.role === "STUDIO" ? "/studio" : "/play";
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-[var(--line-medium)] bg-white/[0.03] px-3.5 py-3 text-[15px] text-[var(--ink-primary)] placeholder:text-[var(--ink-tertiary)] outline-none transition focus:border-[var(--accent)] focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_var(--accent-wash)]";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--surface-page)] px-5 py-12 text-[var(--ink-primary)] font-sans">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% -10%, var(--bloom-ambient-tint), transparent 55%)",
        }}
      />

      <div
        className="relative z-10 w-full max-w-[400px]"
        style={{
          animation: "empty-panel-in 480ms cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
          >
            ← Repro
          </Link>
          <h1 className="mt-4 text-[32px] font-semibold tracking-[-0.03em]">
            Sign in
          </h1>
          <p className="mt-2 text-[15px] text-[var(--ink-secondary)]">
            Open playtests or your studio triage board.
          </p>
        </div>

        <div className="rounded-[28px] border border-[var(--line-subtle)] bg-[var(--surface-raised)]/80 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-2xl border border-[var(--sev-critical)]/25 bg-[var(--sev-critical-wash)] px-3.5 py-3 text-[13px] text-[var(--sev-critical)]"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[12px] font-medium text-[var(--ink-secondary)]"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="alex@studio.dev"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[12px] font-medium text-[var(--ink-secondary)]"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-full bg-[var(--accent)] px-4 py-3.5 text-[15px] font-semibold text-[var(--accent-on-fill)] shadow-[0_8px_24px_var(--accent-glow)] transition hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-[var(--ink-secondary)]">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-semibold text-[var(--accent-text)] hover:opacity-80"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
