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
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm border border-hairline bg-raised p-8 rounded-sm">
        <div className="mb-6">
          <Link
            href="/"
            className="text-xs uppercase tracking-wider text-slate hover:text-ink transition-colors"
          >
            ← Repro
          </Link>
          <h1 className="text-xl font-semibold mt-2 tracking-tight">Sign in</h1>
          <p className="text-sm text-slate mt-1">
            Access playtesting campaigns or your studio board.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-slate uppercase mb-1"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-hairline bg-paper text-ink text-sm rounded-sm focus:outline-none focus:border-ink"
              placeholder="developer@studio.dev"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-slate uppercase mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-hairline bg-paper text-ink text-sm rounded-sm focus:outline-none focus:border-ink"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-ink text-paper text-sm font-medium rounded-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Signing in..." : "Continue"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-hairline text-center text-xs text-slate">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-ink underline font-medium">
            Register
          </Link>
        </div>
      </div>
    </main>
  );
}
