"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<"TESTER" | "STUDIO">("TESTER");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [studioName, setStudioName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName,
          role,
          birthDate: birthDate || undefined,
          studioName: role === "STUDIO" ? studioName : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to create account.");
      }

      if (data.user.role === "STUDIO") {
        router.push("/studio");
      } else {
        router.push("/play");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--surface-page)] flex items-center justify-center p-6 text-[var(--ink-primary)] font-sans relative">
      <div className="absolute top-6 right-6"></div>

      <div className="w-full max-w-md border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-8 rounded-[var(--radius-md)] shadow-xs">
        <div className="mb-6">
          <Link
            href="/"
            className="text-xs font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
          >
            ← Repro
          </Link>
          <h1 className="text-xl font-semibold mt-2 tracking-tight text-[var(--ink-primary)]">
            Create account
          </h1>
          <p className="text-xs text-[var(--ink-secondary)] mt-1">
            Sign up as a studio developer or playtester.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[var(--sev-critical-wash)] border border-[var(--sev-critical)]/20 text-[var(--ink-primary)] text-xs rounded-[var(--radius-sm)]">
            {error}
          </div>
        )}

        {/* Role toggle */}
        <div className="flex border border-[var(--line-subtle)] rounded-[var(--radius-sm)] mb-6 p-0.5 bg-[var(--surface-page)]">
          <button
            type="button"
            onClick={() => setRole("TESTER")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-all ${
              role === "TESTER"
                ? "bg-[var(--accent)] text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)] shadow-xs"
                : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            }`}
          >
            Playtester
          </button>
          <button
            type="button"
            onClick={() => setRole("STUDIO")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-all ${
              role === "STUDIO"
                ? "bg-[var(--accent)] text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)] shadow-xs"
                : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            }`}
          >
            Game Studio
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="displayName"
              className="block text-xs font-medium text-[var(--ink-secondary)] uppercase mb-1"
            >
              Your Name
            </label>
            <input
              id="displayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)]"
              placeholder={role === "STUDIO" ? "Alex Chen" : "Sam Fisher"}
            />
          </div>

          {role === "STUDIO" && (
            <div>
              <label
                htmlFor="studioName"
                className="block text-xs font-medium text-[var(--ink-secondary)] uppercase mb-1"
              >
                Studio Name
              </label>
              <input
                id="studioName"
                type="text"
                required
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)]"
                placeholder="Northwind Interactive"
              />
            </div>
          )}

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
              Password (min 8 chars)
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label
              htmlFor="birthDate"
              className="block text-xs font-medium text-[var(--ink-secondary)] uppercase mb-1"
            >
              Date of Birth{" "}
              <span className="text-[var(--ink-tertiary)] font-normal">
                (Age verified for NDA)
              </span>
            </label>
            <input
              id="birthDate"
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)]"
            />
            <p className="text-[11px] text-[var(--ink-secondary)] mt-1">
              Must be at least 18 years old to join NDA-protected playtests.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[var(--accent)] text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)] text-sm font-medium rounded-[var(--radius-sm)] disabled:opacity-50 transition-opacity"
          >
            {loading ? "Creating account..." : "Register"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[var(--line-subtle)] text-center text-xs text-[var(--ink-secondary)]">
          Already registered?{" "}
          <Link
            href="/login"
            className="text-[var(--ink-primary)] underline font-medium"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
