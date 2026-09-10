"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <main className="min-h-screen bg-[var(--color-surface-page)] flex items-center justify-center p-6 text-[var(--color-ink-primary)] font-sans relative">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md border border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] p-8 rounded-[var(--radius-md)] shadow-xs">
        <div className="mb-6">
          <Link
            href="/"
            className="text-xs font-semibold text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] transition-colors"
          >
            ← Repro
          </Link>
          <h1 className="text-xl font-semibold mt-2 tracking-tight text-[var(--color-ink-primary)]">
            Create account
          </h1>
          <p className="text-xs text-[var(--color-ink-secondary)] mt-1">
            Sign up as a studio developer or playtester.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[var(--color-alert-soft)] border border-[var(--color-alert)]/20 text-[var(--color-ink-primary)] text-xs rounded-[var(--radius-sm)]">
            {error}
          </div>
        )}

        {/* Role toggle */}
        <div className="flex border border-[var(--color-line-hairline)] rounded-[var(--radius-sm)] mb-6 p-0.5 bg-[var(--color-surface-page)]">
          <button
            type="button"
            onClick={() => setRole("TESTER")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-all ${
              role === "TESTER"
                ? "bg-[var(--color-ink-primary)] text-[var(--color-surface-page)] shadow-xs"
                : "text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)]"
            }`}
          >
            Playtester
          </button>
          <button
            type="button"
            onClick={() => setRole("STUDIO")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-all ${
              role === "STUDIO"
                ? "bg-[var(--color-ink-primary)] text-[var(--color-surface-page)] shadow-xs"
                : "text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)]"
            }`}
          >
            Game Studio
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="displayName"
              className="block text-xs font-medium text-[var(--color-ink-secondary)] uppercase mb-1"
            >
              Your Name
            </label>
            <input
              id="displayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-line-hairline)] bg-[var(--color-surface-page)] text-[var(--color-ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--color-accent)]"
              placeholder={role === "STUDIO" ? "Alex Chen" : "Sam Fisher"}
            />
          </div>

          {role === "STUDIO" && (
            <div>
              <label
                htmlFor="studioName"
                className="block text-xs font-medium text-[var(--color-ink-secondary)] uppercase mb-1"
              >
                Studio Name
              </label>
              <input
                id="studioName"
                type="text"
                required
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-line-hairline)] bg-[var(--color-surface-page)] text-[var(--color-ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--color-accent)]"
                placeholder="Northwind Interactive"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-[var(--color-ink-secondary)] uppercase mb-1"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-line-hairline)] bg-[var(--color-surface-page)] text-[var(--color-ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--color-accent)]"
              placeholder="alex@studio.dev"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-[var(--color-ink-secondary)] uppercase mb-1"
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
              className="w-full px-3 py-2 border border-[var(--color-line-hairline)] bg-[var(--color-surface-page)] text-[var(--color-ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--color-accent)]"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label
              htmlFor="birthDate"
              className="block text-xs font-medium text-[var(--color-ink-secondary)] uppercase mb-1"
            >
              Date of Birth{" "}
              <span className="text-[var(--color-ink-tertiary)] font-normal">
                (Age verified for NDA)
              </span>
            </label>
            <input
              id="birthDate"
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-line-hairline)] bg-[var(--color-surface-page)] text-[var(--color-ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--color-accent)]"
            />
            <p className="text-[11px] text-[var(--color-ink-secondary)] mt-1">
              Must be at least 18 years old to join NDA-protected playtests.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[var(--color-ink-primary)] text-[var(--color-surface-page)] text-sm font-medium rounded-[var(--radius-sm)] hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Creating account..." : "Register"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[var(--color-line-hairline)] text-center text-xs text-[var(--color-ink-secondary)]">
          Already registered?{" "}
          <Link href="/login" className="text-[var(--color-ink-primary)] underline font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
