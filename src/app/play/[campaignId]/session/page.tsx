"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { WatermarkedFrame } from "@/components/WatermarkedFrame";
import {
  DELIVERY_MODE_CAVEAT,
  DELIVERY_MODE_LABEL,
  capabilitiesOf,
  deliveryModeOf,
  isBuildKind,
} from "@/domain/campaigns/delivery";

interface ValidationResponse {
  valid: boolean;
  userId: string;
  campaignId: string;
  campaignTitle: string;
  buildKind: string;
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
      <div className="min-h-screen bg-[var(--surface-page)] flex items-center justify-center p-6 text-[14px] text-[var(--ink-secondary)]">
        Validating signed build access token...
      </div>
    );
  }

  // Explicit rejection view when token or UA is mismatched or expired (§6.1)
  if (errorStatus !== null || !data) {
    const isUaMismatch = errorStatus === 403;

    return (
      <main className="min-h-screen bg-[var(--surface-page)] flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-8 rounded-[var(--radius-md)] text-center shadow-xs">
          <div className="w-10 h-10 mx-auto mb-4 rounded-full bg-[var(--sev-critical-wash)] text-[var(--sev-critical)] flex items-center justify-center font-bold text-lg">
            !
          </div>

          <h1 className="text-[20px] font-semibold tracking-tight text-[var(--ink-primary)] mb-2">
            Access Denied
          </h1>

          <div className="p-4 bg-[var(--sev-critical-wash)] border border-[var(--sev-critical)]/20 text-[var(--ink-primary)] text-[13px] rounded-[var(--radius-sm)] mb-6 leading-relaxed text-left">
            {errorMessage}
          </div>

          {isUaMismatch && (
            <p className="text-[12px] text-[var(--ink-secondary)] mb-6 leading-relaxed">
              Every build access token is cryptographically bound to the
              specific browser and device that requested it.
            </p>
          )}

          <Link
            href={`/play/${campaignId}/nda`}
            className="inline-block py-2.5 px-5 bg-[var(--accent)] text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)] text-[13px] font-medium rounded-[var(--radius-sm)] transition-opacity"
          >
            Request Your Own Access Link
          </Link>
        </div>
      </main>
    );
  }

  // Past the error branch, so `data` is present. An unrecognised build kind
  // is treated as the least capable mode rather than the most: claiming
  // protection we cannot deliver is the failure that matters here.
  const buildKind = isBuildKind(data.buildKind)
    ? data.buildKind
    : "EXTERNAL_LINK";
  const mode = deliveryModeOf(buildKind);
  const capabilities = capabilitiesOf(buildKind);

  return (
    <div
      onClick={() => setHeaderVisible((v) => !v)}
      className="min-h-screen bg-[var(--surface-page)] flex flex-col text-[var(--ink-primary)] font-sans"
    >
      {/* Session Top Bar with Mobile Auto-Hide (§3.5) */}
      <header
        className={`border-b border-[var(--line-subtle)] bg-[var(--surface-raised)] px-6 py-3 flex items-center justify-between transition-transform duration-200 z-30 ${
          headerVisible ? "translate-y-0" : "-translate-y-full md:translate-y-0"
        }`}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="font-semibold text-sm tracking-tight text-[var(--ink-primary)]"
          >
            Repro
          </Link>
          <span className="text-[var(--line-subtle)]">/</span>
          <span className="text-[13px] font-medium text-[var(--ink-primary)] truncate max-w-[200px]">
            {data.campaignTitle}
          </span>
          <span className="text-[11px] px-2 py-0.5 border border-[var(--line-subtle)] rounded-[var(--radius-sm)] font-mono text-[var(--ink-secondary)]">
            ID: #{data.watermarkId}
          </span>
        </div>

        <div className="flex items-center gap-4 text-[13px]">
          <span className="text-[var(--ink-secondary)] hidden sm:inline">
            {capabilities.watermarksFrames
              ? "Watermark active"
              : `${DELIVERY_MODE_LABEL[mode]} — no frame watermark`}
          </span>
          <Link
            href={`/play/${campaignId}/nda`}
            className="text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
          >
            Leave Session
          </Link>
        </div>
      </header>

      {/* Main Play Area — wide stage so export / full-screen controls never clip */}
      <main
        onClick={(e) => e.stopPropagation()}
        className="flex min-h-0 flex-1 flex-col items-stretch justify-center p-0 sm:p-4"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden border-0 bg-[var(--surface-raised)] sm:rounded-[20px] sm:border sm:border-[var(--line-subtle)] sm:shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          {capabilities.watermarksFrames ? (
            <WatermarkedFrame
              watermarkId={data.watermarkId}
              campaignTitle={data.campaignTitle}
              campaignId={data.campaignId}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 sm:p-12 text-center">
              <h2 className="mb-2 text-[15px] font-semibold text-[var(--ink-primary)]">
                This build runs outside Repro
              </h2>
              <p className="mx-auto mb-6 max-w-md text-[13px] leading-relaxed text-[var(--ink-secondary)]">
                {DELIVERY_MODE_CAVEAT[mode]}
              </p>
              <a
                href={`/api/access/${token}/build`}
                rel="noopener noreferrer"
                className="inline-block rounded-full bg-[var(--accent)] px-5 py-2.5 text-[13px] font-medium text-[var(--accent-on-fill)] transition-opacity hover:bg-[var(--accent-hover)]"
              >
                Open the build
              </a>
            </div>
          )}

          <div className="flex flex-col items-start justify-between gap-2 border-t border-[var(--line-subtle)] bg-[var(--surface-page)] px-4 py-3 text-[12px] text-[var(--ink-secondary)] sm:flex-row sm:items-center">
            <div>
              Delivery:{" "}
              <span className="text-[var(--ink-primary)]">
                {DELIVERY_MODE_LABEL[mode]}
              </span>
            </div>
            <div>
              Access expires at{" "}
              {new Date(data.expiresAt).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
