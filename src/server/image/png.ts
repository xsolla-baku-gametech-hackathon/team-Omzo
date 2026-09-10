import { inflateSync } from "node:zlib";

import type { Frame } from "@/domain/watermark/frame";

/**
 * A minimal PNG reader, written rather than installed.
 *
 * SPEC.md §2 fixes the dependency list and forensics needs exactly one thing
 * from an image library: raw RGBA out of the lossless PNG that the session
 * page's export button produces. That is a few chunk headers, one call to
 * node's own zlib, and the five PNG row filters.
 *
 * It reads what a browser canvas writes -- 8-bit, non-interlaced, RGB or RGBA
 * -- and refuses everything else by name rather than guessing.
 */

export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const COLOUR_TYPE_RGB = 2;
const COLOUR_TYPE_RGBA = 6;

/** Paeth predictor, from the PNG specification. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function decodePng(buffer: Buffer): Frame {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new UnsupportedImageError(
      "That file is not a PNG. Export the frame with the button on the session page, which saves a lossless PNG.",
    );
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) break;

    if (type === "IHDR") {
      width = buffer.readUInt32BE(start);
      height = buffer.readUInt32BE(start + 4);
      bitDepth = buffer[start + 8];
      colourType = buffer[start + 9];
      interlace = buffer[start + 12];
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(start, end));
    } else if (type === "IEND") {
      break;
    }

    offset = end + 4; // skip the CRC
  }

  if (width === 0 || height === 0) {
    throw new UnsupportedImageError("That PNG has no readable image header.");
  }
  if (bitDepth !== 8) {
    throw new UnsupportedImageError(
      `Only 8-bit PNGs can be read; this one is ${bitDepth}-bit.`,
    );
  }
  if (colourType !== COLOUR_TYPE_RGB && colourType !== COLOUR_TYPE_RGBA) {
    throw new UnsupportedImageError(
      "Only full-colour PNGs can be read. Palette and greyscale images are not supported.",
    );
  }
  if (interlace !== 0) {
    throw new UnsupportedImageError(
      "Interlaced PNGs are not supported. Re-export the frame from the session page.",
    );
  }
  if (idat.length === 0) {
    throw new UnsupportedImageError("That PNG contains no image data.");
  }

  const raw = inflateSync(Buffer.concat(idat));
  const channels = colourType === COLOUR_TYPE_RGBA ? 4 : 3;
  const stride = width * channels;

  if (raw.length < height * (stride + 1)) {
    throw new UnsupportedImageError("That PNG is truncated.");
  }

  // Un-filtering is in place and row-by-row: every filter refers to the
  // reconstructed bytes of the row above, so the previous row must already be
  // final before this one is read.
  const pixels = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;

    for (let i = 0; i < stride; i += 1) {
      const value = raw[src + i];
      const left = i >= channels ? pixels[dst + i - channels] : 0;
      const above = y > 0 ? pixels[up + i] : 0;
      const upLeft = y > 0 && i >= channels ? pixels[up + i - channels] : 0;

      let reconstructed: number;
      switch (filter) {
        case 0:
          reconstructed = value;
          break;
        case 1:
          reconstructed = value + left;
          break;
        case 2:
          reconstructed = value + above;
          break;
        case 3:
          reconstructed = value + ((left + above) >> 1);
          break;
        case 4:
          reconstructed = value + paeth(left, above, upLeft);
          break;
        default:
          throw new UnsupportedImageError(
            `That PNG uses row filter ${filter}, which is not part of the format.`,
          );
      }
      pixels[dst + i] = reconstructed & 0xff;
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const s = p * channels;
    const d = p * 4;
    data[d] = pixels[s];
    data[d + 1] = pixels[s + 1];
    data[d + 2] = pixels[s + 2];
    data[d + 3] = channels === 4 ? pixels[s + 3] : 255;
  }

  return { width, height, data };
}
