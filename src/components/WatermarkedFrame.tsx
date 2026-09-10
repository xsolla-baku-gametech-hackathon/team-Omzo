"use client";

import { useCallback, useEffect, useRef } from "react";

import { embedWatermark } from "@/domain/watermark/encode";
import { startDemoGame, stopDemoGame } from "@/overlay/demo-game";
import { initOverlay, destroyOverlay } from "@/overlay/overlay";

/**
 * The build frame, marked with the tester's identity (SPEC.md §6.2).
 *
 * In Phase 7 this frame hosts the demo game and the bug-report overlay.
 * The watermark is applied every second to the live canvas so any frame
 * grabbed at any moment carries the tester's identity.
 *
 * The overlay binds F1 and captures canvas-only screenshots, system info,
 * console tail, and game state from window.__repro.getState().
 */

const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 720;

/** Re-marked once a second, so any frame grabbed at any moment carries it. */
const REMARK_INTERVAL_MS = 1000;

interface WatermarkedFrameProps {
  readonly watermarkId: number;
  readonly campaignTitle: string;
  readonly campaignId?: string;
  readonly reporterId?: string;
}

export function WatermarkedFrame({
  watermarkId,
  campaignId,
  reporterId,
}: WatermarkedFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Whether the game loop is running. */
  const gameRunningRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Start the demo game.
    startDemoGame(canvas);
    gameRunningRef.current = true;

    // Apply watermark over the game at intervals.
    const markTimer = window.setInterval(() => {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      try {
        const imageData = context.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        const marked = embedWatermark(
          { width: imageData.width, height: imageData.height, data: imageData.data },
          watermarkId,
        );
        const out = context.createImageData(FRAME_WIDTH, FRAME_HEIGHT);
        out.data.set(marked.data);
        context.putImageData(out, 0, 0);
      } catch {
        // Watermark failure must never crash the game.
      }
    }, REMARK_INTERVAL_MS);

    // Initialise the overlay.
    if (campaignId && reporterId) {
      initOverlay({
        endpoint: "/api/ingest",
        campaignId,
        reporterId,
      });
    }

    return () => {
      window.clearInterval(markTimer);
      stopDemoGame();
      destroyOverlay();
      gameRunningRef.current = false;
    };
  }, [watermarkId, campaignId, reporterId]);

  const exportFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // PNG, never JPEG, and never downscaled. A +/-2 delta does not survive a
    // lossy re-encode, which is exactly why the report screenshots in §7 --
    // downscaled and JPEG'd on the client -- carry no watermark and are never
    // presented as if they did.
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `repro-frame-${watermarkId}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [watermarkId]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={FRAME_WIDTH}
        height={FRAME_HEIGHT}
        className="block w-full aspect-video bg-ink"
        data-repro-game="true"
      />

      <div className="p-4 bg-paper border-t border-hairline flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-label text-slate max-w-measure">
            This frame carries your identifier in its brightness. Press{" "}
            <kbd className="px-1.5 py-0.5 bg-raised border border-hairline rounded text-[11px] font-mono">
              F1
            </kbd>{" "}
            to report a bug. Use arrow keys or WASD to move, space to jump.
          </p>
          <button
            type="button"
            onClick={exportFrame}
            className="shrink-0 py-2 px-4 border border-hairline text-label rounded-sm hover:bg-raised"
          >
            Export frame for forensics
          </button>
        </div>

        <div className="text-[11px] text-slate font-mono flex flex-wrap gap-x-6 gap-y-1">
          <span>← → move between rooms</span>
          <span>Room 1: Lift bug (collision freeze)</span>
          <span>Room 2: Audio dropout</span>
          <span>Room 3: Drone swarm (FPS drop)</span>
        </div>
      </div>
    </div>
  );
}
