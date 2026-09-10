"use client";

import { useRef, useState } from "react";

/**
 * Upload a frame, get at most one name back (SPEC.md §6.2).
 *
 * The four outcomes are rendered as four visibly different things rather than
 * one result panel with different text in it. A studio reading this screen is
 * deciding whether to accuse someone, and "no watermark found" must never be
 * mistakable at a glance for a name.
 */

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
      setError("The upload did not complete. Try again.");
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
        className="border border-dashed border-hairline bg-raised rounded-sm p-10 text-center"
      >
        <p className="text-label-lg text-ink">
          Drop a leaked frame here, or choose a file.
        </p>
        <p className="mt-2 text-label text-slate max-w-measure mx-auto">
          A lossless PNG exported from a session. Screenshots that have been
          re-saved as JPEG carry no recoverable watermark.
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
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mt-5 py-2 px-4 bg-ink text-paper text-label rounded-sm disabled:opacity-50"
        >
          {busy ? "Reading the frame…" : "Choose a frame"}
        </button>

        {fileName !== null && (
          <p className="mt-3 text-label text-slate font-mono">{fileName}</p>
        )}
      </div>

      {error !== null && (
        <p className="border-l-3 border-l-sev-critical pl-4 py-2 text-label-lg text-ink">
          {error}
        </p>
      )}

      {result?.kind === "no_watermark" && (
        <div className="border border-hairline rounded-sm p-6">
          <p className="text-label-lg text-ink">No watermark in this frame.</p>
          <p className="mt-2 text-label text-slate max-w-measure">
            That means this image cannot be traced — not that it was not leaked.
            A frame that has been re-encoded, filtered, cropped or photographed
            off a screen loses the pattern.
          </p>
        </div>
      )}

      {result?.kind === "unknown_grant" && (
        <div className="border border-hairline rounded-sm p-6">
          <p className="text-label-lg text-ink">
            Watermark {result.watermarkId} was read, but no access grant carries
            it.
          </p>
          <p className="mt-2 text-label text-slate max-w-measure">
            The grant may have been deleted. There is no one to name.
          </p>
        </div>
      )}

      {result?.kind === "other_studio" && (
        <div className="border border-hairline rounded-sm p-6">
          <p className="text-label-lg text-ink">
            This frame belongs to another studio&rsquo;s campaign.
          </p>
          <p className="mt-2 text-label text-slate max-w-measure">
            Watermark {result.watermarkId} was read cleanly, but the tester
            behind it signed an agreement with someone else, so their identity
            is not ours to show you.
          </p>
        </div>
      )}

      {result?.kind === "identified" && (
        <div className="border border-hairline rounded-sm overflow-hidden">
          <div className="border-l-3 border-l-verified bg-raised p-6">
            <p className="text-label text-slate">This frame was issued to</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              {result.displayName}
            </p>
            <p className="mt-1 text-label text-slate font-mono">
              {result.email}
            </p>
          </div>

          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 p-6 text-label">
            <div>
              <dt className="text-slate">Campaign</dt>
              <dd className="text-ink">{result.campaignTitle}</dd>
            </div>
            <div>
              <dt className="text-slate">Access issued</dt>
              <dd className="text-ink">
                {new Date(result.issuedAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-slate">Watermark</dt>
              <dd className="text-ink font-mono">{result.watermarkId}</dd>
            </div>
            <div>
              <dt className="text-slate">Read strength</dt>
              <dd className="text-ink font-mono">
                {(result.confidence * 100).toFixed(0)}% over {result.frameWidth}
                ×{result.frameHeight}
              </dd>
            </div>
          </dl>

          <p className="border-t border-hairline px-6 py-4 text-label text-slate max-w-measure">
            Read strength is how clearly the frame carried the pattern. It is
            not a probability that this person leaked anything — it says the
            image came from their session, not what they did with it.
          </p>
        </div>
      )}
    </div>
  );
}
