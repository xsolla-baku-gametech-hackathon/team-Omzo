"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  const [agreed, setAgreed] = useState(false);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!agreed && !alreadySigned) return;
    setError(null);
    setSubmitting(true);

    try {
      if (!alreadySigned) {
        const signRes = await fetch(`/api/campaigns/${campaignId}/nda`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typedName }),
        });

        const signData = await signRes.json();
        if (!signRes.ok) {
          throw new Error(signData.message || "Failed to sign NDA.");
        }
      }

      // Request personal access token
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
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-slate">
        Loading agreement...
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="border border-hairline bg-raised p-6 rounded-sm text-center">
          <p className="text-sm text-slate">{error || "Campaign not found."}</p>
          <Link
            href="/play"
            className="mt-4 inline-block text-xs font-medium underline"
          >
            Back to campaigns
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-hairline bg-raised px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold text-lg tracking-tight">
              Repro
            </Link>
            <span className="text-hairline">/</span>
            <Link
              href="/play"
              className="text-sm font-medium text-slate hover:text-ink"
            >
              Play
            </Link>
            <span className="text-hairline">/</span>
            <span className="text-sm font-medium text-slate">
              Non-Disclosure Agreement
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {campaign.title}
          </h1>
          <p className="text-sm text-slate mt-1">
            Sign the legal confidentiality agreement to unlock your unique
            watermarked build access.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm">
            {error}
          </div>
        )}

        {alreadySigned && (
          <div className="mb-6 p-4 bg-teal-50 border border-teal-200 text-teal-800 text-sm rounded-sm flex items-center justify-between">
            <div>
              <span className="font-semibold">NDA previously signed</span> by{" "}
              {typedName}.
            </div>
            <button
              onClick={handleSignAndProceed}
              disabled={submitting}
              className="py-1.5 px-3 bg-teal-800 text-white text-xs font-medium rounded-sm hover:opacity-90"
            >
              {submitting ? "Launching..." : "Launch Session →"}
            </button>
          </div>
        )}

        <div className="border border-hairline bg-raised rounded-sm overflow-hidden mb-8">
          <div className="px-6 py-3 border-b border-hairline bg-paper flex items-center justify-between">
            <span className="text-xs font-medium text-slate uppercase tracking-wider">
              Legal Terms &amp; Conditions
            </span>
            <span className="text-xs text-slate font-mono">
              Forensic traceable
            </span>
          </div>

          <div className="p-8 font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink/90 border-b border-hairline max-h-96 overflow-y-auto">
            {campaign.ndaBodyMd}
          </div>

          <form
            onSubmit={handleSignAndProceed}
            className="p-8 space-y-6 bg-paper"
          >
            {!alreadySigned && (
              <>
                <div className="flex items-start gap-3">
                  <input
                    id="agree"
                    type="checkbox"
                    required
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-1"
                  />
                  <label
                    htmlFor="agree"
                    className="text-xs text-slate leading-relaxed"
                  >
                    I acknowledge that I am at least 18 years of age, agree to
                    the terms above, and understand that builds contain an
                    invisible forensic watermark uniquely assigned to my account
                    to detect leaks.
                  </label>
                </div>

                <div>
                  <label
                    htmlFor="typedName"
                    className="block text-xs font-medium text-slate uppercase mb-1"
                  >
                    Type your full legal name to sign
                  </label>
                  <input
                    id="typedName"
                    type="text"
                    required
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    className="w-full max-w-md px-3 py-2 border border-hairline bg-raised text-ink text-sm rounded-sm focus:outline-none focus:border-ink font-medium"
                    placeholder="First and Last Name"
                  />
                  <p className="text-[11px] text-slate mt-1">
                    Your signature will be bound to your legal name, an
                    irreversible hash of your IP, and timestamp.
                  </p>
                </div>
              </>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={
                  submitting ||
                  (!alreadySigned && (!agreed || typedName.trim().length < 2))
                }
                className="py-2.5 px-6 bg-ink text-paper text-sm font-medium rounded-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {submitting
                  ? "Processing..."
                  : alreadySigned
                    ? "Launch Session →"
                    : "Sign Agreement & Continue →"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
