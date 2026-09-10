"use client";

import { useCallback, useEffect, useRef } from "react";

import { GRID, LUMINANCE_DELTA, SUB } from "@/domain/watermark/config";
import { embedWatermark } from "@/domain/watermark/encode";
import {
  bitIndexForBlock,
  payloadBits,
  subCellSign,
} from "@/domain/watermark/frame";

/**
 * The build frame, marked with the tester's identity (SPEC.md §6.2).
 *
 * Two canvases, and the difference between them matters.
 *
 * The overlay is what the tester looks at: the same pattern, the same
 * geometry, the same payload, drawn as very faint translucent cells over the
 * frame once a second. Being an alpha blend it lands near +/-2 rather than
 * exactly on it, which is fine for something nobody can see.
 *
 * The export is what forensics reads, and it does not go through the overlay
 * at all. It takes the game canvas alone and runs the same encoder the
 * decoder was tested against, so the file on disk carries exact deltas rather
 * than whatever the browser's compositor rounded them to.
 */

const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 720;

/** ~2/255. The alpha that moves a mid-tone by one luminance delta. */
const OVERLAY_ALPHA = LUMINANCE_DELTA / 255;

interface WatermarkedFrameProps {
  readonly watermarkId: number;
  readonly campaignTitle: string;
}

export function WatermarkedFrame({
  watermarkId,
  campaignTitle,
}: WatermarkedFrameProps) {
  const gameRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // TODO(phase-7): the demo game draws here. Until then the frame is a still
  // scene, which is all the watermark and the export button need.
  useEffect(() => {
    const context = gameRef.current?.getContext("2d");
    if (!context) return;

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
  }, [campaignTitle]);

  // The visible layer. Redrawn once a second so that a frame grabbed at any
  // moment carries a mark, and so a still screenshot cannot be explained away
  // as having been taken before the overlay loaded.
  useEffect(() => {
    const canvas = overlayRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const bits = payloadBits(watermarkId);

    const paint = () => {
      context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      for (let gy = 0; gy < GRID; gy += 1) {
        for (let gx = 0; gx < GRID; gx += 1) {
          const bit = bits[bitIndexForBlock(gy * GRID + gx)] === 1 ? 1 : -1;
          const x0 = (gx * FRAME_WIDTH) / GRID;
          const y0 = (gy * FRAME_HEIGHT) / GRID;
          const cellW = FRAME_WIDTH / GRID / SUB;
          const cellH = FRAME_HEIGHT / GRID / SUB;

          for (let sy = 0; sy < SUB; sy += 1) {
            for (let sx = 0; sx < SUB; sx += 1) {
              const up = bit * subCellSign(sx, sy) > 0;
              context.fillStyle = up
                ? `rgba(255,255,255,${OVERLAY_ALPHA})`
                : `rgba(0,0,0,${OVERLAY_ALPHA})`;
              context.fillRect(x0 + sx * cellW, y0 + sy * cellH, cellW, cellH);
            }
          }
        }
      }
    };

    paint();
    const timer = window.setInterval(paint, 1000);
    return () => window.clearInterval(timer);
  }, [watermarkId]);

  const exportFrame = useCallback(() => {
    const game = gameRef.current;
    const context = game?.getContext("2d");
    if (!game || !context) return;

    const source = context.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const marked = embedWatermark(
      { width: source.width, height: source.height, data: source.data },
      watermarkId,
    );

    const out = document.createElement("canvas");
    out.width = FRAME_WIDTH;
    out.height = FRAME_HEIGHT;
    const outContext = out.getContext("2d");
    if (!outContext) return;
    // Writing back into the ImageData we already hold, rather than
    // constructing a new one, keeps the buffer the browser gave us.
    source.data.set(marked.data);
    outContext.putImageData(source, 0, 0);

    // PNG, never JPEG, and never downscaled. A +/-2 delta does not survive a
    // lossy re-encode, which is exactly why the report screenshots in §7 --
    // which are downscaled and JPEG'd on the client -- carry no watermark and
    // are never presented as if they did.
    out.toBlob((blob) => {
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
      <div className="relative aspect-video bg-ink">
        <canvas
          ref={gameRef}
          width={FRAME_WIDTH}
          height={FRAME_HEIGHT}
          className="absolute inset-0 w-full h-full"
        />
        <canvas
          ref={overlayRef}
          width={FRAME_WIDTH}
          height={FRAME_HEIGHT}
          aria-hidden
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      </div>

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
