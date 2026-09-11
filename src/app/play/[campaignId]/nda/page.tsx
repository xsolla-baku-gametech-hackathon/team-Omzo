"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  maxBirthDateForAdult,
  validateAdultAge,
  validateLegalName,
} from "@/domain/access/identityRules";

interface CampaignData {
  id: string;
  title: string;
  ndaBodyMd: string;
}

export default function NdaSigningPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.campaignId as string;

  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [typedName, setTypedName] = useState("");
  const [typedNameTouched, setTypedNameTouched] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [isHuman, setIsHuman] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [birthDateTouched, setBirthDateTouched] = useState(false);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxBirthDate = useMemo(() => maxBirthDateForAdult(), []);

  const nameError = useMemo(() => {
    if (!typedNameTouched && !typedName) return null;
    const result = validateLegalName(typedName);
    return result.valid ? null : (result.reason ?? "Invalid name.");
  }, [typedName, typedNameTouched]);

  const ageError = useMemo(() => {
    if (!birthDateTouched && !birthDate) return null;
    const result = validateAdultAge(birthDate);
    return result.valid ? null : (result.reason ?? "Invalid date of birth.");
  }, [birthDate, birthDateTouched]);

  const isFormValid = useMemo(() => {
    if (alreadySigned) return true;
    return (
      agreed &&
      isHuman &&
      validateLegalName(typedName).valid &&
      validateAdultAge(birthDate).valid
    );
  }, [alreadySigned, agreed, isHuman, typedName, birthDate]);

  useEffect(() => {
    async function load() {
      try {
        const [cRes, ndaRes] = await Promise.all([
          fetch(`/api/campaigns/${campaignId}`),
          fetch(`/api/campaigns/${campaignId}/nda`),
        ]);

        if (!cRes.ok) throw new Error("Failed to load campaign.");
        const cData = await cRes.json();
        setCampaign(cData.campaign);

        if (ndaRes.status === 401) {
          router.push(`/login?redirect=/play/${campaignId}/nda`);
          return;
        }

        if (ndaRes.ok) {
          const ndaData = await ndaRes.json();
          if (ndaData.signed) {
            setAlreadySigned(true);
            setTypedName(ndaData.signature?.typedName ?? "");
            setIsHuman(true);
            setAgreed(true);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Error loading campaign.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [campaignId, router]);

  async function handleSignAndProceed(e: React.FormEvent) {
    e.preventDefault();
    setTypedNameTouched(true);
    setBirthDateTouched(true);

    if (!alreadySigned && !isFormValid) {
      setError("Complete every required field before continuing.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      if (!alreadySigned) {
        const nameCheck = validateLegalName(typedName);
        if (!nameCheck.valid) {
          throw new Error(nameCheck.reason ?? "Invalid legal name.");
        }
        const ageCheck = validateAdultAge(birthDate);
        if (!ageCheck.valid) {
          throw new Error(
            ageCheck.reason ??
              "You must be at least 18 years old to sign this NDA.",
          );
        }

        const signRes = await fetch(`/api/campaigns/${campaignId}/nda`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            typedName: typedName.trim(),
            birthDate,
            attestedHuman: isHuman,
            agreedToTerms: agreed,
          }),
        });

        const signData = await signRes.json();
        if (!signRes.ok) {
          throw new Error(signData.message || "Failed to sign NDA.");
        }
      }

      const accessRes = await fetch(`/api/campaigns/${campaignId}/access`, {
        method: "POST",
      });
      const accessData = await accessRes.json();
      if (!accessRes.ok) {
        throw new Error(accessData.message || "Failed to issue access grant.");
      }

      router.push(accessData.accessUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to obtain access.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)] flex items-center justify-center p-6 text-sm text-[var(--ink-secondary)]">
        Loading agreement…
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)] flex items-center justify-center p-6">
        <div className="border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-6 rounded-[28px] text-center max-w-sm">
          <p className="text-sm text-[var(--ink-secondary)]">
            {error || "Campaign not found."}
          </p>
          <Link
            href="/play"
            className="mt-4 inline-block text-xs font-medium text-[var(--accent-text)] underline"
          >
            Back to campaigns
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--ink-primary)] font-sans">
      <header className="border-b border-[var(--line-subtle)] bg-[var(--surface-raised)]/90 backdrop-blur px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link
            href="/"
            className="font-semibold text-lg tracking-tight text-[var(--ink-primary)]"
          >
            Repro
          </Link>
          <span className="text-[var(--line-subtle)]">/</span>
          <Link
            href="/play"
            className="text-sm font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
          >
            Play
          </Link>
          <span className="text-[var(--line-subtle)]">/</span>
          <span className="text-sm font-medium text-[var(--ink-secondary)]">
            NDA
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--accent-wash)] border border-[var(--accent)]/20 text-xs font-medium text-[var(--accent-text)] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            Watermarked closed build
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] text-[var(--ink-primary)]">
            {campaign.title}
          </h1>
          <p className="text-sm text-[var(--ink-secondary)] mt-1.5 leading-relaxed max-w-2xl">
            Sign the confidentiality agreement to receive personal, expiring
            access. Your typed name, age attestation, and hashed request
            metadata are stored with the signature record.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 bg-[var(--sev-critical-wash)] border border-[var(--sev-critical)]/30 text-[var(--sev-critical)] text-sm rounded-2xl"
          >
            {error}
          </div>
        )}

        {alreadySigned && (
          <div className="mb-6 p-4 bg-[var(--accent-wash)] border border-[var(--accent)]/40 text-[var(--ink-primary)] text-sm rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="font-semibold text-[var(--accent-text)]">
                NDA already signed:
              </span>{" "}
              {typedName}
            </div>
            <button
              type="button"
              onClick={handleSignAndProceed}
              disabled={submitting}
              className="py-2 px-4 bg-[var(--accent)] text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)] text-xs font-semibold rounded-full transition-opacity shadow-sm"
            >
              {submitting ? "Starting…" : "Start session →"}
            </button>
          </div>
        )}

        <div className="border border-[var(--line-subtle)] bg-[var(--surface-raised)]/90 rounded-[28px] overflow-hidden mb-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="px-6 py-3.5 border-b border-[var(--line-subtle)] bg-[var(--surface-sunken)] flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[var(--ink-secondary)] uppercase tracking-wider">
              Legal terms
            </span>
            <span className="text-xs text-[var(--accent-text)] font-mono">
              Forensic watermark active
            </span>
          </div>

          <div className="p-6 sm:p-8 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[var(--ink-primary)]/90 border-b border-[var(--line-subtle)] max-h-72 overflow-y-auto bg-[var(--surface-sunken)]/40">
            {campaign.ndaBodyMd}
          </div>

          <form
            onSubmit={handleSignAndProceed}
            className="p-6 sm:p-8 space-y-6 bg-[var(--surface-raised)]"
            noValidate
          >
            {!alreadySigned && (
              <>
                <div>
                  <label
                    htmlFor="typedName"
                    className="block text-xs font-medium text-[var(--ink-secondary)] mb-1.5"
                  >
                    Full legal name
                  </label>
                  <input
                    id="typedName"
                    type="text"
                    autoComplete="name"
                    required
                    value={typedName}
                    onChange={(e) => {
                      setTypedName(e.target.value);
                      if (!typedNameTouched) setTypedNameTouched(true);
                    }}
                    onBlur={() => setTypedNameTouched(true)}
                    className={`w-full max-w-md px-3.5 py-3 border rounded-xl text-[15px] font-medium focus:outline-none transition-[border-color,box-shadow] ${
                      nameError
                        ? "border-[var(--sev-critical)] bg-[var(--sev-critical-wash)] text-[var(--ink-primary)]"
                        : "border-[var(--line-medium)] bg-[var(--surface-page)] text-[var(--ink-primary)] focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-wash)]"
                    }`}
                    placeholder="Alex Chen"
                  />
                  {nameError ? (
                    <p className="text-xs text-[var(--sev-critical)] mt-1.5 font-medium">
                      {nameError}
                    </p>
                  ) : (
                    <p className="text-[12px] text-[var(--ink-secondary)] mt-1.5">
                      First and last name required. Stored with your signature
                      record.
                    </p>
                  )}
                </div>

                <div className="border border-[var(--line-subtle)] bg-[var(--surface-page)] p-4 rounded-2xl space-y-2.5">
                  <div className="text-xs font-semibold text-[var(--ink-secondary)]">
                    Age verification (18+)
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div>
                      <label
                        htmlFor="birthDate"
                        className="block text-xs text-[var(--ink-secondary)] mb-1"
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
                          setBirthDateTouched(true);
                        }}
                        onBlur={() => setBirthDateTouched(true)}
                        className={`px-3 py-2.5 border rounded-xl text-sm focus:outline-none transition-[border-color,box-shadow] ${
                          ageError
                            ? "border-[var(--sev-critical)] bg-[var(--sev-critical-wash)]"
                            : "border-[var(--line-medium)] bg-[var(--surface-raised)] focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-wash)]"
                        } text-[var(--ink-primary)]`}
                      />
                      {ageError && (
                        <p className="text-xs text-[var(--sev-critical)] mt-1.5 font-medium">
                          {ageError}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-[var(--ink-secondary)] leading-relaxed sm:pt-6 max-w-md">
                      You must be at least 18. The server recalculates age from
                      this date and refuses underage signatures.
                    </p>
                  </div>
                </div>

                <div className="border border-[var(--line-subtle)] bg-[var(--surface-page)] p-5 rounded-2xl space-y-4">
                  <div className="text-xs font-semibold text-[var(--ink-secondary)]">
                    Human attestation
                  </div>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    Repro does not run camera or ID document checks in this
                    build. Access still requires an explicit attestation plus
                    the server-side name and age gates above.
                  </p>
                  <div className="flex items-start gap-2">
                    <input
                      id="isHuman"
                      type="checkbox"
                      required
                      checked={isHuman}
                      onChange={(e) => setIsHuman(e.target.checked)}
                      className="mt-1 accent-[var(--accent)]"
                    />
                    <label
                      htmlFor="isHuman"
                      className="text-xs text-[var(--ink-secondary)] leading-relaxed cursor-pointer"
                    >
                      I confirm I am a real person, the identity details I
                      entered are accurate, and I am not an automated bot or
                      script.
                    </label>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <input
                    id="agree"
                    type="checkbox"
                    required
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <label
                    htmlFor="agree"
                    className="text-xs text-[var(--ink-secondary)] leading-relaxed cursor-pointer"
                  >
                    I accept the confidentiality terms and understand that
                    exported game frames may carry a personal{" "}
                    <strong>forensic watermark</strong> used to investigate
                    leaks.
                  </label>
                </div>

                <div className="p-4 bg-[var(--surface-sunken)] border border-[var(--line-subtle)] rounded-2xl text-xs text-[var(--ink-secondary)] leading-relaxed">
                  <strong className="text-[var(--ink-primary)]">Privacy:</strong>{" "}
                  request IPs are stored only as a salted hash. Studios see your
                  tester identity and signature record — not a raw IP. Birth
                  date is used for the age gate and NDA eligibility.
                </div>
              </>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || (!alreadySigned && !isFormValid)}
                className="w-full sm:w-auto py-3 px-8 bg-[var(--accent)] text-[var(--accent-on-fill)] text-sm font-semibold rounded-full hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-[transform,opacity] active:scale-[0.98] shadow-[0_8px_24px_var(--accent-glow)]"
              >
                {submitting
                  ? "Processing…"
                  : alreadySigned
                    ? "Start session →"
                    : "Sign NDA and get access →"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
