"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
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

      if (data.user.role === "STUDIO") {
        router.push("/studio");
      } else {
        router.push("/play");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--surface-page)] flex items-center justify-center p-6 text-[var(--ink-primary)] font-sans relative">
      <div className="absolute top-6 right-6"></div>

      <div className="w-full max-w-sm border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-8 rounded-[var(--radius-md)] shadow-xs">
        <div className="mb-6">
          <Link
            href="/"
            className="text-xs font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
          >
            ← Repro
          </Link>
          <h1 className="text-xl font-semibold mt-2 tracking-tight text-[var(--ink-primary)]">
            Sign in
          </h1>
          <p className="text-xs text-[var(--ink-secondary)] mt-1">
            Access playtesting campaigns or your studio board.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[var(--sev-critical-wash)] border border-[var(--sev-critical)]/20 text-[var(--ink-primary)] text-xs rounded-[var(--radius-sm)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-[var(--ink-secondary)] uppercase mb-1"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="alex@studio.dev"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-[var(--ink-secondary)] uppercase mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[var(--accent)] text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)] text-sm font-medium rounded-[var(--radius-sm)] disabled:opacity-50 transition-opacity"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[var(--line-subtle)] text-center text-xs text-[var(--ink-secondary)]">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-[var(--ink-primary)] underline font-medium"
          >
            Register
          </Link>
        </div>
      </div>
    </main>
  );
}
