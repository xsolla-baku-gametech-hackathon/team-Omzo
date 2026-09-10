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

/**
 * ForensicsUpload — UI_SPEC_V2_DARK.md §5.6
 *
 * The plainest screen in the product: a drop zone, and a result. No
 * celebration, no animation. Naming a person as the source of a leak is
 * the heaviest thing this software does, and the gravity of the moment
 * comes from the plainness.
 */
export function ForensicsUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
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
    <div className="space-y-[var(--space-8)]">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void identify(file);
        }}
        className={`flex h-[var(--forensics-drop-h)] flex-col items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed text-center transition-colors duration-[var(--dur-fast)] ${
          dragging ? "border-[var(--accent)]" : "border-[var(--line-medium)]"
        }`}
      >
        <p className="text-[length:var(--type-ui-size)] text-[var(--ink-tertiary)]">
          Drop a leaked frame here
        </p>
        <p className="mt-[var(--space-2)] max-w-[var(--body-measure)] px-[var(--space-4)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-tertiary)]">
          Lossless PNG exported directly from a session. A screenshot that has
          been re-encoded as JPEG carries no watermark.
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
        <div className="mt-[var(--space-6)]">
          <Button
            type="button"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? "Reading frame…" : "Choose a frame"}
          </Button>
        </div>

        {fileName !== null && (
          <p className="mt-[var(--space-3)] px-[var(--space-4)] text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
            {fileName}
          </p>
        )}
      </div>

      {error !== null && (
        <p
          role="alert"
          className="max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--sev-critical)]"
        >
          {error}
        </p>
      )}

      {/* Outcome: No Watermark (§3.6) */}
      {result?.kind === "no_watermark" && (
        <div>
          <p className="text-[length:var(--type-title-size)] leading-[var(--type-title-lh)] tracking-[var(--type-title-ls)] font-semibold text-[var(--ink-primary)]">
            No watermark recovered
          </p>
          <p className="mt-[var(--space-2)] max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
            This frame may have been re-encoded, cropped, or captured from a
            build issued before watermarking was enabled.
          </p>
        </div>
      )}

      {/* Outcome: Unknown Grant */}
      {result?.kind === "unknown_grant" && (
        <div>
          <p className="text-[length:var(--type-title-size)] leading-[var(--type-title-lh)] tracking-[var(--type-title-ls)] font-semibold text-[var(--ink-primary)]">
            Watermark #{result.watermarkId} detected, but no matching grant
            exists
          </p>
          <p className="mt-[var(--space-2)] max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
            The access record may have expired or been purged.
          </p>
        </div>
      )}

      {/* Outcome: Other Studio */}
      {result?.kind === "other_studio" && (
        <div>
          <p className="text-[length:var(--type-title-size)] leading-[var(--type-title-lh)] tracking-[var(--type-title-ls)] font-semibold text-[var(--ink-primary)]">
            This frame belongs to another studio&rsquo;s campaign
          </p>
          <p className="mt-[var(--space-2)] max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
            Watermark #{result.watermarkId} was read, but confidentiality
            agreements are bound to the originating studio.
          </p>
        </div>
      )}

      {/* Outcome: Identified Tester (§3.6) */}
      {result?.kind === "identified" && (
        <div>
          <div className="flex items-center gap-[var(--space-3)]">
            <span
              aria-hidden="true"
              className="h-[8px] w-[8px] shrink-0 rounded-[var(--radius-full)] bg-[var(--state-verified)]"
            />
            <h3 className="text-[length:var(--type-title-size)] leading-[var(--type-title-lh)] tracking-[var(--type-title-ls)] font-semibold text-[var(--ink-primary)]">
              Tester #{result.watermarkId} — {result.displayName}
            </h3>
          </div>
          <p className="mt-[var(--space-2)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-secondary)]">
            Confidence {result.confidence.toFixed(2)}
            <span aria-hidden="true"> · </span>Campaign &ldquo;
            {result.campaignTitle}&rdquo;
            <span aria-hidden="true"> · </span>Access granted{" "}
            {new Date(result.issuedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="mt-[var(--space-4)] max-w-[var(--body-measure)] text-[length:var(--type-meta-size)] leading-[var(--type-body-lh)] text-[var(--ink-tertiary)]">
            Confidence is how clearly the watermark was retrieved from pixel
            luminance. It confirms the frame originated from this tester&apos;s
            build session.
          </p>
        </div>
      )}
    </div>
  );
}
