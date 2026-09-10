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

  const studioSlug = studioName
    ? studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : "your-studio";

  return (
    <main className="min-h-screen bg-[var(--surface-page)] flex items-center justify-center p-6 text-[var(--ink-primary)] font-sans relative overflow-hidden">
      {/* Background ambient light */}
      <div
        className="pointer-events-none fixed top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] opacity-20 blur-[100px] rounded-full"
        style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
      />

      <div className="w-full max-w-md border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-8 rounded-[var(--radius-md)] shadow-xl relative z-10">
        <div className="mb-6">
          <Link
            href="/"
            className="text-xs font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors inline-flex items-center gap-1"
          >
            ← Repro Ana Səhifə
          </Link>
          <h1 className="text-2xl font-semibold mt-2 tracking-tight text-[var(--ink-primary)]">
            Hesab Yarat
          </h1>
          <p className="text-xs text-[var(--ink-secondary)] mt-1">
            {role === "STUDIO"
              ? "Oyun studiyanız və komandanız üçün təhlükəsiz triaj mühiti qurun."
              : "Playtester kimi qeydiyyatdan keçin və oyunları sınaqdan keçirərək coin qazanın."}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[var(--sev-critical-wash)] border border-[var(--sev-critical)]/30 text-[var(--sev-critical)] text-xs rounded-[var(--radius-sm)] flex items-center gap-1.5">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Animated Role toggle */}
        <div className="flex border border-[var(--line-subtle)] rounded-[var(--radius-sm)] mb-6 p-1 bg-[var(--surface-page)] gap-1">
          <button
            type="button"
            onClick={() => setRole("TESTER")}
            className={`flex-1 py-2 text-xs font-semibold rounded-[var(--radius-sm)] transition-all flex items-center justify-center gap-1.5 ${
              role === "TESTER"
                ? "bg-[var(--accent)] text-[var(--accent-on-fill)] shadow-xs"
                : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            }`}
          >
            <span>🎮</span>
            <span>Playtester</span>
          </button>
          <button
            type="button"
            onClick={() => setRole("STUDIO")}
            className={`flex-1 py-2 text-xs font-semibold rounded-[var(--radius-sm)] transition-all flex items-center justify-center gap-1.5 ${
              role === "STUDIO"
                ? "bg-[var(--accent)] text-[var(--accent-on-fill)] shadow-xs"
                : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            }`}
          >
            <span>🏢</span>
            <span>Game Studio</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="displayName"
              className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1"
            >
              {role === "STUDIO" ? "Təmsilçi / Menecer Adı" : "Ad və Soyadınız"}
            </label>
            <input
              id="displayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              placeholder={role === "STUDIO" ? "Məs: Alex Chen" : "Məs: Sam Fisher"}
            />
          </div>

          {/* Animated Company / Game Studio Details */}
          {role === "STUDIO" && (
            <div className="p-4 border border-[var(--accent)]/30 bg-[var(--surface-page)] rounded-[var(--radius-sm)] space-y-3 animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider flex items-center gap-1.5">
                  <span>🏢</span>
                  <span>Şirkət / Studiya Məlumatı</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--accent-wash)] text-[var(--accent)] border border-[var(--accent)]/30">
                  Verified Studio
                </span>
              </div>

              <div>
                <label
                  htmlFor="studioName"
                  className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1"
                >
                  Şirkət / Studiya Adı (Game Studio Name)
                </label>
                <input
                  id="studioName"
                  type="text"
                  required
                  value={studioName}
                  onChange={(e) => setStudioName(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-raised)] text-[var(--ink-primary)] text-sm font-semibold rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  placeholder="Məs: Northwind Games və ya Baku Tech Interactive"
                />
              </div>

              {/* Dynamic slug & perks preview */}
              <div className="pt-2 border-t border-[var(--line-subtle)] space-y-1.5 text-[11px] text-[var(--ink-secondary)]">
                <div className="flex items-center justify-between font-mono">
                  <span className="text-[var(--ink-tertiary)]">Studiya Linki:</span>
                  <span className="text-[var(--accent)]">repro.dev/@{studioSlug}</span>
                </div>
                <div className="flex items-center gap-3 pt-1 text-[10px] text-[var(--ink-secondary)]">
                  <span>✓ 16-bit Forensic Watermark</span>
                  <span>✓ AI Triage Engine</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1"
            >
              Email Ünvanı
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              placeholder={role === "STUDIO" ? "contact@studio.dev" : "alex@playtest.io"}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1"
            >
              Şifrə (ən azı 8 simvol)
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label
              htmlFor="birthDate"
              className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1"
            >
              Doğum Tarixi{" "}
              <span className="text-[var(--ink-tertiary)] font-normal">
                (NDA üçün 18+ yaş tələbi)
              </span>
            </label>
            <input
              id="birthDate"
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            <p className="text-[11px] text-[var(--ink-secondary)] mt-1">
              Qapalı oyun testlərində NDA hüquqi etibarlılığı üçün 18 yaş tələb olunur.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[var(--accent)] text-[var(--accent-on-fill)] text-sm font-semibold rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-all shadow-md mt-2"
          >
            {loading
              ? "Qeydiyyat aparılır..."
              : role === "STUDIO"
                ? "🏢 Studiya Hesabını Yarat"
                : "🎮 Tester Hesabını Aç"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[var(--line-subtle)] text-center text-xs text-[var(--ink-secondary)]">
          Artıq hesabınız var?{" "}
          <Link
            href="/login"
            className="text-[var(--accent)] hover:underline font-medium"
          >
            Daxil olun
          </Link>
        </div>
      </div>
    </main>
  );
}
