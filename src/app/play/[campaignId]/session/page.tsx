"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { WatermarkedFrame } from "@/components/WatermarkedFrame";

interface ValidationResponse {
  valid: boolean;
  userId: string;
  campaignId: string;
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
  const [headerVisible, setHeaderVisible] = useState(true);

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

  // Auto-hide top bar on mobile after 3s (UI_SPEC §3.5)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.innerWidth < 768) {
        setHeaderVisible(false);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-page)] flex items-center justify-center p-6 text-[14px] text-[var(--color-ink-secondary)]">
        Validating signed build access token...
      </div>
    );
  }

  // Explicit rejection view when token or UA is mismatched or expired (§6.1)
  if (errorStatus !== null || !data) {
    const isUaMismatch = errorStatus === 403;

    return (
      <main className="min-h-screen bg-[var(--color-surface-page)] flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] p-8 rounded-[var(--radius-md)] text-center shadow-xs">
          <div className="w-10 h-10 mx-auto mb-4 rounded-full bg-[var(--color-alert-soft)] text-[var(--color-alert)] flex items-center justify-center font-bold text-lg">
            !
          </div>

          <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-ink-primary)] mb-2">
            Access Denied
          </h1>

          <div className="p-4 bg-[var(--color-alert-soft)] border border-[var(--color-alert)]/20 text-[var(--color-ink-primary)] text-[13px] rounded-[var(--radius-sm)] mb-6 leading-relaxed text-left">
            {errorMessage}
          </div>

          {isUaMismatch && (
            <p className="text-[12px] text-[var(--color-ink-secondary)] mb-6 leading-relaxed">
              Every build access token is cryptographically bound to the
              specific browser and device that requested it.
            </p>
          )}

          <Link
            href={`/play/${campaignId}/nda`}
            className="inline-block py-2.5 px-5 bg-[var(--color-ink-primary)] text-[var(--color-surface-page)] text-[13px] font-medium rounded-[var(--radius-sm)] hover:opacity-90 transition-opacity"
          >
            Request Your Own Access Link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div
      onClick={() => setHeaderVisible((v) => !v)}
      className="min-h-screen bg-[var(--color-surface-page)] flex flex-col text-[var(--color-ink-primary)] font-sans"
    >
      {/* Session Top Bar with Mobile Auto-Hide (§3.5) */}
      <header
        className={`border-b border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] px-6 py-3 flex items-center justify-between transition-transform duration-200 z-30 ${
          headerVisible ? "translate-y-0" : "-translate-y-full md:translate-y-0"
        }`}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="font-semibold text-sm tracking-tight text-[var(--color-ink-primary)]"
          >
            Repro
          </Link>
          <span className="text-[var(--color-line-hairline)]">/</span>
          <span className="text-[13px] font-medium text-[var(--color-ink-primary)] truncate max-w-[200px]">
            {data.campaignTitle}
          </span>
          <span className="text-[11px] px-2 py-0.5 border border-[var(--color-line-hairline)] rounded-[var(--radius-sm)] font-mono text-[var(--color-ink-secondary)]">
            ID: #{data.watermarkId}
          </span>
        </div>

        <div className="flex items-center gap-4 text-[13px]">
          <span className="text-[var(--color-ink-secondary)] hidden sm:inline">
            Watermark active
          </span>
          <Link
            href={`/play/${campaignId}/nda`}
            className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] transition-colors"
          >
            Leave Session
          </Link>
        </div>
      </header>

      {/* Main Play Area */}
      <main
        onClick={(e) => e.stopPropagation()}
        className="flex-1 flex flex-col items-center justify-center p-2 sm:p-6"
      >
        <div className="max-w-4xl w-full border border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] rounded-[var(--radius-md)] overflow-hidden shadow-xs">
          <WatermarkedFrame
            watermarkId={data.watermarkId}
            campaignTitle={data.campaignTitle}
            campaignId={data.campaignId}
            reporterId={data.userId}
          />

          <div className="p-4 bg-[var(--color-surface-page)] border-t border-[var(--color-line-hairline)] flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-[var(--color-ink-secondary)]">
            <div>
              Build mode:{" "}
              <span className="font-mono text-[var(--color-ink-primary)]">
                {data.buildKind}
              </span>
            </div>
            <div>
              Token expires at {new Date(data.expiresAt).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
