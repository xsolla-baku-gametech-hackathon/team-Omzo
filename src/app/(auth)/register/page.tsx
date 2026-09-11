"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  maxBirthDateForAdult,
  validateAdultAge,
  validateNameParts,
} from "@/domain/access/identityRules";
import { validatePasswordStrength } from "@/domain/access/passwordRules";

type Role = "TESTER" | "STUDIO";

type FieldErrors = {
  firstName?: string;
  lastName?: string;
  studioName?: string;
  email?: string;
  password?: string;
  birthDate?: string;
};

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("TESTER");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [studioName, setStudioName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const maxBirthDate = useMemo(() => maxBirthDateForAdult(), []);
  const passwordAnalysis = useMemo(
    () => validatePasswordStrength(password),
    [password],
  );

  const studioSlug = studioName
    ? studioName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    : "your-studio";

  function validateForm(): FieldErrors {
    const next: FieldErrors = {};
    const nameCheck = validateNameParts(firstName, lastName);
    if (!nameCheck.valid) {
      if (!firstName.trim()) next.firstName = "First name is required.";
      else if (firstName.trim().length < 2)
        next.firstName = "First name must be at least 2 letters.";
      if (!lastName.trim()) next.lastName = "Last name is required.";
      else if (lastName.trim().length < 2)
        next.lastName = "Last name must be at least 2 letters.";
      if (!next.firstName && !next.lastName && nameCheck.reason) {
        next.firstName = nameCheck.reason;
      }
    }

    if (role === "STUDIO" && studioName.trim().length < 2) {
      next.studioName = "Studio name must be at least 2 characters.";
    }

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = "Enter a valid email address.";
    }

    if (!passwordAnalysis.isValid) {
      next.password =
        passwordAnalysis.errors[0] ?? "Password does not meet requirements.";
    }

    const ageCheck = validateAdultAge(birthDate);
    if (!ageCheck.valid) {
      next.birthDate =
        ageCheck.reason ?? "You must be at least 18 years old.";
    }

    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);

    const nextErrors = validateForm();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const first =
        nextErrors.birthDate ??
        nextErrors.lastName ??
        nextErrors.firstName ??
        nextErrors.password ??
        nextErrors.email ??
        nextErrors.studioName ??
        "Please fix the highlighted fields.";
      setError(first);
      return;
    }

    setLoading(true);
    const displayName = `${firstName.trim()} ${lastName.trim()}`;

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName,
          role,
          birthDate,
          studioName: role === "STUDIO" ? studioName.trim() : undefined,
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

  const inputClass = (hasError?: boolean) =>
    [
      "w-full rounded-xl border bg-white/[0.03] px-3.5 py-3 text-[15px] text-[var(--ink-primary)]",
      "placeholder:text-[var(--ink-tertiary)] outline-none transition-[border-color,box-shadow,background-color] duration-200",
      "focus:bg-white/[0.05] focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-wash)]",
      hasError
        ? "border-[var(--sev-critical)]/70 bg-[var(--sev-critical-wash)]"
        : "border-[var(--line-medium)]",
    ].join(" ");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--surface-page)] px-5 py-12 text-[var(--ink-primary)] font-sans">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, var(--bloom-ambient-tint), transparent 55%), radial-gradient(circle at 85% 80%, rgba(139,92,246,0.08), transparent 35%)",
        }}
      />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
          >
            <span aria-hidden className="text-base leading-none">
              ←
            </span>
            Repro
          </Link>
          <h1 className="mt-4 text-[32px] font-semibold tracking-[-0.03em] text-[var(--ink-primary)]">
            Create account
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-secondary)]">
            {role === "STUDIO"
              ? "Set up a secure triage space for your studio and team."
              : "Join as a playtester and earn coins while you find bugs."}
          </p>
        </div>

        <div className="rounded-[28px] border border-[var(--line-subtle)] bg-[var(--surface-raised)]/80 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          {/* Sliding role control */}
          <div
            role="tablist"
            aria-label="Account type"
            className="relative mb-7 grid grid-cols-2 rounded-full bg-[var(--surface-sunken)] p-1"
          >
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-[var(--surface-overlay)] shadow-[0_1px_3px_rgba(0,0,0,0.35),inset_0_0_0_1px_var(--line-subtle)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                transform:
                  role === "STUDIO" ? "translateX(100%)" : "translateX(0)",
              }}
            />
            {(
              [
                { id: "TESTER", label: "Playtester" },
                { id: "STUDIO", label: "Game Studio" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={role === option.id}
                onClick={() => setRole(option.id)}
                className={`relative z-10 rounded-full py-2.5 text-[13px] font-semibold transition-colors duration-200 ${
                  role === option.id
                    ? "text-[var(--ink-primary)]"
                    : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-2xl border border-[var(--sev-critical)]/25 bg-[var(--sev-critical-wash)] px-3.5 py-3 text-[13px] text-[var(--sev-critical)]"
            >
              <span aria-hidden>!</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="firstName"
                  className="mb-1.5 block text-[12px] font-medium text-[var(--ink-secondary)]"
                >
                  First name
                </label>
                <input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (touched)
                      setFieldErrors((prev) => ({
                        ...prev,
                        firstName: undefined,
                      }));
                  }}
                  className={inputClass(Boolean(fieldErrors.firstName))}
                  placeholder="Alex"
                />
                {fieldErrors.firstName && (
                  <p className="mt-1.5 text-[12px] text-[var(--sev-critical)]">
                    {fieldErrors.firstName}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="lastName"
                  className="mb-1.5 block text-[12px] font-medium text-[var(--ink-secondary)]"
                >
                  Last name
                </label>
                <input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    if (touched)
                      setFieldErrors((prev) => ({
                        ...prev,
                        lastName: undefined,
                      }));
                  }}
                  className={inputClass(Boolean(fieldErrors.lastName))}
                  placeholder="Chen"
                />
                {fieldErrors.lastName && (
                  <p className="mt-1.5 text-[12px] text-[var(--sev-critical)]">
                    {fieldErrors.lastName}
                  </p>
                )}
              </div>
            </div>

            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                role === "STUDIO"
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <div className="mb-1 rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-page)]/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[12px] font-semibold tracking-wide text-[var(--ink-secondary)]">
                      Studio details
                    </span>
                    <span className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-text)]">
                      Verified later
                    </span>
                  </div>
                  <label
                    htmlFor="studioName"
                    className="mb-1.5 block text-[12px] font-medium text-[var(--ink-secondary)]"
                  >
                    Company / studio name
                  </label>
                  <input
                    id="studioName"
                    type="text"
                    value={studioName}
                    onChange={(e) => setStudioName(e.target.value)}
                    className={inputClass(Boolean(fieldErrors.studioName))}
                    placeholder="Northwind Games"
                    required={role === "STUDIO"}
                  />
                  {fieldErrors.studioName && (
                    <p className="mt-1.5 text-[12px] text-[var(--sev-critical)]">
                      {fieldErrors.studioName}
                    </p>
                  )}
                  <div className="pt-3 flex items-center justify-between font-mono text-[12px] text-[var(--ink-secondary)]">
                    <span>Studio link preview</span>
                    <span className="text-[var(--accent-text)]">
                      @{studioSlug}
                    </span>
                  </div>
                </div>
              </div>
            </div>

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
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass(Boolean(fieldErrors.email))}
                placeholder={
                  role === "STUDIO" ? "contact@studio.dev" : "you@playtest.io"
                }
              />
              {fieldErrors.email && (
                <p className="mt-1.5 text-[12px] text-[var(--sev-critical)]">
                  {fieldErrors.email}
                </p>
              )}
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass(Boolean(fieldErrors.password))}
                placeholder="At least 8 characters"
              />
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                    <div
                      className="h-full rounded-full transition-all duration-300 ease-out"
                      style={{
                        width: `${Math.max(12, passwordAnalysis.score)}%`,
                        background:
                          passwordAnalysis.strength === "WEAK"
                            ? "var(--sev-critical)"
                            : passwordAnalysis.strength === "FAIR"
                              ? "var(--sev-high)"
                              : "var(--state-verified)",
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[12px] text-[var(--ink-secondary)]">
                    Strength: {passwordAnalysis.strength.replace("_", " ")}
                  </p>
                </div>
              )}
              {fieldErrors.password && (
                <p className="mt-1.5 text-[12px] text-[var(--sev-critical)]">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="birthDate"
                className="mb-1.5 block text-[12px] font-medium text-[var(--ink-secondary)]"
              >
                Date of birth
              </label>
              <input
                id="birthDate"
                type="date"
                required
                max={maxBirthDate}
                value={birthDate}
                onChange={(e) => {
                  setBirthDate(e.target.value);
                  if (touched) {
                    const ageCheck = validateAdultAge(e.target.value);
                    setFieldErrors((prev) => ({
                      ...prev,
                      birthDate: ageCheck.valid
                        ? undefined
                        : (ageCheck.reason ?? "Invalid date of birth."),
                    }));
                  }
                }}
                className={inputClass(Boolean(fieldErrors.birthDate))}
              />
              <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ink-secondary)]">
                You must be 18 or older. Closed playtests require a legally
                valid NDA.
              </p>
              {fieldErrors.birthDate && (
                <p className="mt-1.5 text-[12px] text-[var(--sev-critical)]">
                  {fieldErrors.birthDate}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-full bg-[var(--accent)] px-4 py-3.5 text-[15px] font-semibold text-[var(--accent-on-fill)] shadow-[0_8px_24px_var(--accent-glow)] transition-[transform,background-color,opacity] duration-200 hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:opacity-50"
            >
              {loading
                ? "Creating account…"
                : role === "STUDIO"
                  ? "Create studio account"
                  : "Create tester account"}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-[var(--ink-secondary)]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-[var(--accent-text)] transition-opacity hover:opacity-80"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
