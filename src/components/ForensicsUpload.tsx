"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/Button";

type Result =
  | { kind: "no_watermark" }
  | { kind: "unknown_grant"; watermarkId: number; confidence: number }
  | { kind: "other_studio"; watermarkId: number; confidence: number }
  | {
      kind: "identified";
      watermarkId: number;
      confidence: number;
      displayName: string;
      email: string;
      campaignTitle: string;
      issuedAt: string;
      frameWidth: number;
      frameHeight: number;
    };

export function ForensicsUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function identify(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);

    try {
      const form = new FormData();
      form.append("frame", file);
      const response = await fetch("/api/forensics/identify", {
        method: "POST",
        body: form,
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.message ?? "Could not read that frame.");
        return;
      }
      setResult(json as Result);
    } catch {
      setError("The upload did not complete. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) void identify(file);
        }}
        className="border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-sunken)] rounded-[var(--radius-md)] p-10 text-center transition-colors"
      >
        <p className="text-[16px] font-semibold text-[var(--color-ink-primary)]">
          Drop a leaked frame here, or choose a file
        </p>
        <p className="mt-2 text-[13px] text-[var(--color-ink-secondary)] max-w-[68ch] mx-auto leading-relaxed">
          Lossless PNG exported directly from a session. Screenshots that have been re-encoded as JPEG carry no watermark.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void identify(file);
          }}
        />
        <div className="mt-5">
          <Button
            type="button"
            variant="primary"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? "Reading frame…" : "Choose a frame"}
          </Button>
        </div>

        {fileName !== null && (
          <p className="mt-3 text-[12px] text-[var(--color-ink-secondary)] font-mono">
            {fileName}
          </p>
        )}
      </div>

      {error !== null && (
        <div className="border-l-[3px] border-l-[var(--color-alert)] bg-[var(--color-surface-raised)] pl-4 py-3 text-[14px] text-[var(--color-ink-primary)] rounded-r-[var(--radius-sm)]">
          {error}
        </div>
      )}

      {/* Outcome: No Watermark (§3.6) */}
      {result?.kind === "no_watermark" && (
        <div className="border border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] rounded-[var(--radius-md)] p-6 space-y-2">
          <p className="text-[16px] font-semibold text-[var(--color-ink-primary)]">
            No watermark recovered
          </p>
          <p className="text-[14px] text-[var(--color-ink-secondary)] max-w-[68ch] leading-relaxed">
            This frame may have been re-encoded, cropped, or captured from a build issued before watermarking was enabled.
          </p>
        </div>
      )}

      {/* Outcome: Unknown Grant */}
      {result?.kind === "unknown_grant" && (
        <div className="border border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] rounded-[var(--radius-md)] p-6 space-y-2">
          <p className="text-[16px] font-semibold text-[var(--color-ink-primary)]">
            Watermark #{result.watermarkId} detected, but no matching grant exists
          </p>
          <p className="text-[14px] text-[var(--color-ink-secondary)] max-w-[68ch] leading-relaxed">
            The access record may have expired or been purged.
          </p>
        </div>
      )}

      {/* Outcome: Other Studio */}
      {result?.kind === "other_studio" && (
        <div className="border border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] rounded-[var(--radius-md)] p-6 space-y-2">
          <p className="text-[16px] font-semibold text-[var(--color-ink-primary)]">
            This frame belongs to another studio&rsquo;s campaign
          </p>
          <p className="text-[14px] text-[var(--color-ink-secondary)] max-w-[68ch] leading-relaxed">
            Watermark #{result.watermarkId} was read, but confidentiality agreements are bound to the originating studio.
          </p>
        </div>
      )}

      {/* Outcome: Identified Tester (§3.6) */}
      {result?.kind === "identified" && (
        <div className="border border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] rounded-[var(--radius-md)] overflow-hidden shadow-xs">
          <div className="border-l-[3px] border-l-[var(--color-accent)] p-6 space-y-1">
            <span className="text-[12px] uppercase font-semibold text-[var(--color-ink-secondary)] tracking-wider">
              Identified Access Grant
            </span>
            <h3 className="text-[22px] font-semibold text-[var(--color-ink-primary)]">
              Tester #{result.watermarkId} — {result.displayName}
            </h3>
            <p className="text-[13px] text-[var(--color-ink-secondary)]">
              Confidence {result.confidence.toFixed(2)} · Campaign &ldquo;{result.campaignTitle}&rdquo; · Access granted{" "}
              {new Date(result.issuedAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          <div className="border-t border-[var(--color-line-hairline)] px-6 py-4 bg-[var(--color-surface-sunken)] text-[12px] text-[var(--color-ink-secondary)] leading-relaxed">
            Confidence represents how clearly the watermark was retrieved from pixel luminance. It confirms the frame originated from this tester&apos;s build session.
          </div>
        </div>
      )}
    </div>
  );
}
