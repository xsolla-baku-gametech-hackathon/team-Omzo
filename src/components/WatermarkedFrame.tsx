"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { embedWatermark } from "@/domain/watermark/encode";
import { startDemoGame, stopDemoGame } from "@/overlay/demo-game";
import { destroyOverlay, initOverlay, toggleOverlay } from "@/overlay/overlay";

/**
 * The build frame, marked with the tester's identity (SPEC.md §6.2).
 *
 * Hosts the demo game (or a future hosted build) and re-marks the canvas
 * once a second so any exported frame carries the tester's watermark.
 */

const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 720;
const REMARK_INTERVAL_MS = 1000;

interface WatermarkedFrameProps {
  readonly watermarkId: number;
  readonly campaignTitle: string;
  readonly campaignId?: string;
}

export function WatermarkedFrame({
  watermarkId,
  campaignId,
}: WatermarkedFrameProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    startDemoGame(canvas);

    const markTimer = window.setInterval(() => {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      try {
        const imageData = context.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        const marked = embedWatermark(
          {
            width: imageData.width,
            height: imageData.height,
            data: imageData.data,
          },
          watermarkId,
        );
        const out = context.createImageData(FRAME_WIDTH, FRAME_HEIGHT);
        out.data.set(marked.data);
        context.putImageData(out, 0, 0);
      } catch {
        // Watermark failure must never crash the game.
      }
    }, REMARK_INTERVAL_MS);

    if (campaignId) {
      initOverlay({
        endpoint: "/api/ingest",
        campaignId,
      });
    }

    return () => {
      window.clearInterval(markTimer);
      stopDemoGame();
      destroyOverlay();
    };
  }, [watermarkId, campaignId]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const exportFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = FRAME_WIDTH;
    offscreen.height = FRAME_HEIGHT;
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(canvas, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const imageData = ctx.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const marked = embedWatermark(
      {
        width: imageData.width,
        height: imageData.height,
        data: imageData.data,
      },
      watermarkId,
    );
    const out = ctx.createImageData(FRAME_WIDTH, FRAME_HEIGHT);
    out.data.set(marked.data);
    ctx.putImageData(out, 0, 0);

    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `repro-frame-${watermarkId}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [watermarkId]);

  async function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await root.requestFullscreen();
      }
    } catch {
      // Fullscreen can be blocked by the browser; keep the session usable.
    }
  }

  return (
    <div
      ref={rootRef}
      className={`relative flex flex-col bg-[var(--surface-raised)] ${
        isFullscreen ? "h-screen w-screen" : ""
      }`}
    >
      <div className="relative min-h-0 flex-1 bg-[var(--surface-sunken)]">
        <canvas
          ref={canvasRef}
          width={FRAME_WIDTH}
          height={FRAME_HEIGHT}
          className={`block bg-[var(--surface-sunken)] ${
            isFullscreen
              ? "h-full w-full object-contain"
              : "aspect-video w-full"
          }`}
          data-repro-game="true"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--line-medium)] bg-[var(--surface-page)]/90 px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-primary)] shadow-sm backdrop-blur transition hover:bg-[var(--surface-overlay)] active:scale-[0.98]"
          >
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </button>
          <button
            type="button"
            onClick={() => toggleOverlay()}
            title="Open bug report (~ or F1)"
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[var(--sev-critical)]/30 bg-[var(--surface-page)]/92 px-3.5 py-1.5 text-[12px] font-semibold text-[var(--ink-primary)] shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur transition hover:border-[var(--sev-critical)]/50 hover:bg-[var(--surface-overlay)] active:scale-[0.98]"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--sev-critical)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--sev-critical)]" />
            </span>
            Report bug
            <kbd className="hidden rounded border border-[var(--line-subtle)] bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-tertiary)] sm:inline">
              F1
            </kbd>
          </button>
        </div>
      </div>

      <div
        className={`border-t border-[var(--line-subtle)] bg-[var(--surface-page)] p-4 ${
          isFullscreen ? "pb-[max(1rem,env(safe-area-inset-bottom))]" : ""
        }`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="max-w-xl text-[13px] leading-relaxed text-[var(--ink-secondary)]">
            This frame quietly carries your tester id. Press{" "}
            <kbd className="rounded border border-[var(--line-subtle)] bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--ink-primary)]">
              ~
            </kbd>{" "}
            or{" "}
            <kbd className="rounded border border-[var(--line-subtle)] bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--ink-primary)]">
              F1
            </kbd>{" "}
            to report, or use the buttons. Arrow keys / WASD to move.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => toggleOverlay()}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--accent-on-fill)] transition hover:bg-[var(--accent-hover)]"
            >
              Report bug
            </button>
            <button
              type="button"
              onClick={exportFrame}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-medium)] bg-[var(--surface-raised)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-primary)] transition hover:bg-[var(--surface-overlay)]"
            >
              Export frame
            </button>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-medium)] bg-[var(--surface-raised)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-primary)] transition hover:bg-[var(--surface-overlay)]"
            >
              {isFullscreen ? "Exit" : "Full screen"}
            </button>
          </div>
        </div>

        {!isFullscreen && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-[var(--ink-tertiary)]">
            <span>← → rooms</span>
            <span>Room 1: Lift freeze</span>
            <span>Room 2: Audio dropout</span>
            <span>Room 3: Drone swarm</span>
          </div>
        )}
      </div>
    </div>
  );
}
