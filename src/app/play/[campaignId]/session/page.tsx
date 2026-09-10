"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface ValidationResponse {
  valid: boolean;
  campaignTitle: string;
  buildKind: string;
  buildUrl: string;
  watermarkId: number;
  expiresAt: string;
  error?: string;
  message?: string;
}

export default function SessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const campaignId = params.campaignId as string;
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ValidationResponse | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setErrorStatus(401);
      setErrorMessage(
        "No access token provided. Please request an access link from the campaign page.",
      );
      return;
    }

    async function validate() {
      try {
        const res = await fetch(`/api/access/${token}`);
        const json = await res.json();

        if (!res.ok) {
          setErrorStatus(res.status);
          setErrorMessage(json.message || "Access denied.");
          return;
        }

        setData(json);
      } catch (err) {
        setErrorStatus(500);
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to validate access.",
        );
      } finally {
        setLoading(false);
      }
    }

    void validate();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-6 text-sm text-slate">
        Validating signed build access token...
      </div>
    );
  }

  // Explicit rejection view when token or UA is mismatched or expired (§6.1)
  if (errorStatus !== null || !data) {
    const isUaMismatch = errorStatus === 403;

    return (
      <main className="min-h-screen bg-paper flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-hairline bg-raised p-8 rounded-sm text-center shadow-xs">
          <div className="w-10 h-10 mx-auto mb-4 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-lg">
            !
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-ink mb-2">
            Access Denied
          </h1>

          <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-sm mb-6 leading-relaxed text-left">
            {errorMessage}
          </div>

          {isUaMismatch && (
            <p className="text-xs text-slate mb-6 leading-relaxed">
              Every build access token is cryptographically bound to the
              specific browser and device that requested it.
            </p>
          )}

          <Link
            href={`/play/${campaignId}/nda`}
            className="inline-block py-2.5 px-5 bg-ink text-paper text-xs font-medium rounded-sm hover:opacity-90 transition-opacity"
          >
            Request Your Own Access Link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Session Top Bar */}
      <header className="border-b border-hairline bg-raised px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-semibold text-base tracking-tight">
            Repro
          </Link>
          <span className="text-hairline">/</span>
          <span className="text-xs font-medium text-ink">
            {data.campaignTitle}
          </span>
          <span className="text-[11px] px-2 py-0.5 border border-hairline rounded-xs font-mono text-slate">
            ID: #{data.watermarkId}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="text-slate">Watermark Active</span>
          <Link
            href={`/play/${campaignId}/nda`}
            className="text-slate hover:text-ink transition-colors"
          >
            Leave Session
          </Link>
        </div>
      </header>

      {/* Main Play Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="max-w-4xl w-full border border-hairline bg-raised rounded-sm overflow-hidden shadow-xs">
          <div className="aspect-video bg-ink flex flex-col items-center justify-center p-8 text-paper text-center relative">
            <div className="space-y-4 max-w-md">
              <div className="text-xs uppercase tracking-widest text-slate">
                Active Technical Build Frame
              </div>
              <h2 className="text-xl font-medium tracking-tight">
                {data.campaignTitle}
              </h2>
              <p className="text-xs text-slate/80 leading-relaxed">
                Press{" "}
                <kbd className="px-1.5 py-0.5 bg-paper/20 rounded font-mono text-paper">
                  F1
                </kbd>{" "}
                at any time to open the in-game report overlay.
              </p>
            </div>

            {/* Subtle watermark identifier representation */}
            <div className="absolute bottom-3 right-4 font-mono text-[10px] text-paper/20 select-none">
              WM-TAG-{data.watermarkId}
            </div>
          </div>

          <div className="p-4 bg-paper border-t border-hairline flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate">
            <div>
              Build mode:{" "}
              <span className="font-mono text-ink">{data.buildKind}</span>
            </div>
            <div className="flex items-center gap-4">
              <span>
                Token expires at {new Date(data.expiresAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
