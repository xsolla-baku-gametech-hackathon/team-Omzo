"use client";

import { useCallback, useEffect, useRef } from "react";

import { embedWatermark } from "@/domain/watermark/encode";

/**
 * The build frame, marked with the tester's identity (SPEC.md §6.2).
 *
 * The mark is applied to the frame's own pixels by the same encoder the
 * decoder is tested against, so what the tester sees and what an exported
 * file carries are the same frame -- not two approximations of one.
 *
 * The obvious alternative, a translucent overlay canvas composited on top,
 * was tried and does not work. Alpha blending is not symmetric: over a dark
 * scene, white at 0.8% alpha lifts a pixel by about two units while black at
 * the same alpha drops it by a fifth of one. The pattern stops being a
 * balanced +/-2 and becomes a brightening-only texture, which is both visible
 * on a near-black frame and no longer the thing the decoder was measured on.
 */

const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 720;

/** Re-marked once a second, so any frame grabbed at any moment carries it. */
const REMARK_INTERVAL_MS = 1000;

interface WatermarkedFrameProps {
  readonly watermarkId: number;
  readonly campaignTitle: string;
}

export function WatermarkedFrame({
  watermarkId,
  campaignTitle,
}: WatermarkedFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The frame before marking. Re-marking the marked frame would compound. */
  const cleanRef = useRef<ImageData | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;

    // TODO(phase-7): the demo game draws here. Until then the frame is a
    // still scene, which is all the watermark and the export need.
    const drawScene = () => {
      context.fillStyle = "#101615";
      context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      context.fillStyle = "#1d2926";
      context.fillRect(0, FRAME_HEIGHT * 0.68, FRAME_WIDTH, FRAME_HEIGHT);
      context.fillStyle = "#2f3f3a";
      for (let i = 0; i < 6; i += 1) {
        context.fillRect(120 + i * 190, 250 + (i % 3) * 60, 130, 220);
      }
      context.fillStyle = "#c9d3d0";
      context.font = "500 34px ui-sans-serif, system-ui, sans-serif";
      context.fillText(campaignTitle, 64, 92);
      context.fillStyle = "#6e7b77";
      context.font = "400 20px ui-monospace, Menlo, monospace";
      context.fillText("build frame — press F1 to report", 64, 128);
    };

    const mark = () => {
      let clean = cleanRef.current;
      if (clean === null) {
        drawScene();
        clean = context.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        cleanRef.current = clean;
      }
      const marked = embedWatermark(
        { width: clean.width, height: clean.height, data: clean.data },
        watermarkId,
      );
      const out = context.createImageData(FRAME_WIDTH, FRAME_HEIGHT);
      out.data.set(marked.data);
      context.putImageData(out, 0, 0);
    };

    mark();
    const timer = window.setInterval(mark, REMARK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [campaignTitle, watermarkId]);

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
      />

      <div className="p-4 bg-paper border-t border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-label text-slate max-w-measure">
          This frame carries your identifier in its brightness. Exporting saves
          a lossless copy that a studio can trace back to you.
        </p>
        <button
          type="button"
          onClick={exportFrame}
          className="shrink-0 py-2 px-4 border border-hairline text-label rounded-sm hover:bg-raised"
        >
          Export frame for forensics
        </button>
      </div>
    </div>
  );
}
