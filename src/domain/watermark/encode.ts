import { GRID, LUMINANCE_DELTA, MAX_WATERMARK_ID } from "./config";
import {
  blockBounds,
  bitIndexForBlock,
  payloadBits,
  subCellIndex,
  subCellSign,
} from "./frame";
import type { Frame } from "./frame";

export class InvalidWatermarkIdError extends Error {
  constructor(watermarkId: number) {
    super(
      `A watermark id must be a whole number between 1 and ${MAX_WATERMARK_ID}; received ${watermarkId}.`,
    );
    this.name = "InvalidWatermarkIdError";
  }
}

/**
 * Embeds a watermark id into a frame (SPEC.md §6.2).
 *
 * The frame is tiled into 8x8 blocks, one payload bit per block. Within a
 * block the delta alternates in a fine checkerboard: a 1 bit brightens the
 * cells on one diagonal by 2 and darkens the other diagonal by 2, and a 0 bit
 * does the reverse. The frame's average brightness is therefore unchanged --
 * only the phase of a pattern far too small to see carries the payload.
 *
 * The shift is applied equally to R, G and B, which moves luma by the same
 * amount whatever the weighting and leaves hue untouched. A colour cast would
 * be far more visible than a brightness one.
 *
 * Returns a new frame. The caller's pixels are not modified, because the
 * session page holds one ImageData it re-watermarks every second and an
 * in-place version would accumulate the delta until the pattern was visible.
 */
export function embedWatermark(frame: Frame, watermarkId: number): Frame {
  if (
    !Number.isInteger(watermarkId) ||
    watermarkId < 1 ||
    watermarkId > MAX_WATERMARK_ID
  ) {
    throw new InvalidWatermarkIdError(watermarkId);
  }

  const out = new Uint8ClampedArray(frame.data);
  const bits = payloadBits(watermarkId);

  for (let gy = 0; gy < GRID; gy += 1) {
    for (let gx = 0; gx < GRID; gx += 1) {
      const bit = bits[bitIndexForBlock(gy * GRID + gx)] === 1 ? 1 : -1;
      const { x0, x1, y0, y1 } = blockBounds(frame, gx, gy);
      const spanX = x1 - x0;
      const spanY = y1 - y0;
      if (spanX <= 0 || spanY <= 0) continue;

      for (let y = y0; y < y1; y += 1) {
        const sy = subCellIndex(y - y0, spanY);
        for (let x = x0; x < x1; x += 1) {
          const sx = subCellIndex(x - x0, spanX);
          const delta = bit * subCellSign(sx, sy) * LUMINANCE_DELTA;
          const i = (y * frame.width + x) * 4;
          // Uint8ClampedArray does the clamping at 0 and 255 for us, which is
          // also where the scheme quietly loses a block: pure black and pure
          // white cannot carry a signal. The redundancy is what covers that.
          out[i] = out[i] + delta;
          out[i + 1] = out[i + 1] + delta;
          out[i + 2] = out[i + 2] + delta;
        }
      }
    }
  }

  return { width: frame.width, height: frame.height, data: out };
}
