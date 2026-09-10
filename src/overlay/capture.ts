/**
 * Canvas-only screenshot capture (§7).
 *
 * Captures the game canvas — never the full screen — downscaled to at most
 * 1280px wide, encoded as JPEG at quality 0.8. Typical result: 150–250 KB.
 * Anything still over 2 MB after encoding is rejected client-side with a
 * clear message.
 */

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.8;
const MAX_BYTES = 2 * 1024 * 1024;

export interface CaptureResult {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

export interface CaptureError {
  readonly error: string;
}

export function captureCanvas(
  canvas: HTMLCanvasElement,
): CaptureResult | CaptureError {
  try {
    const srcWidth = canvas.width;
    const srcHeight = canvas.height;

    if (srcWidth === 0 || srcHeight === 0) {
      return { error: "Canvas has zero dimensions." };
    }

    // Downscale if wider than MAX_WIDTH.
    let outWidth = srcWidth;
    let outHeight = srcHeight;
    if (srcWidth > MAX_WIDTH) {
      const scale = MAX_WIDTH / srcWidth;
      outWidth = MAX_WIDTH;
      outHeight = Math.round(srcHeight * scale);
    }

    // If the canvas is already the right size, encode directly.
    if (outWidth === srcWidth && outHeight === srcHeight) {
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      if (dataUrl.length > MAX_BYTES) {
        return {
          error: `Screenshot is ${(dataUrl.length / 1024 / 1024).toFixed(1)} MB, exceeding the 2 MB limit. Try a smaller canvas.`,
        };
      }
      return { dataUrl, width: outWidth, height: outHeight };
    }

    // Downscale onto an offscreen canvas.
    const off = document.createElement("canvas");
    off.width = outWidth;
    off.height = outHeight;
    const ctx = off.getContext("2d");
    if (!ctx) {
      return { error: "Could not create offscreen canvas context." };
    }
    ctx.drawImage(canvas, 0, 0, outWidth, outHeight);

    const dataUrl = off.toDataURL("image/jpeg", JPEG_QUALITY);
    if (dataUrl.length > MAX_BYTES) {
      return {
        error: `Screenshot is ${(dataUrl.length / 1024 / 1024).toFixed(1)} MB, exceeding the 2 MB limit.`,
      };
    }
    return { dataUrl, width: outWidth, height: outHeight };
  } catch {
    return { error: "Failed to capture canvas." };
  }
}
