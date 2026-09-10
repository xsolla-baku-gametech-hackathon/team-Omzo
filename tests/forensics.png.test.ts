import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { decodeWatermark } from "@/domain/watermark/decode";
import { embedWatermark } from "@/domain/watermark/encode";
import type { Frame } from "@/domain/watermark/frame";
import { UnsupportedImageError, decodePng } from "@/server/image/png";

/**
 * The PNG reader is written rather than installed (SPEC.md §2), so it has to
 * earn that with tests over all five row filters -- the encoder in a browser
 * picks per row, and a filter this reader got wrong would corrupt exactly the
 * few luminance units the watermark lives in.
 */

/** Minimal PNG writer, test-only, using one fixed row filter throughout. */
function encodePng(frame: Frame, filter: number): Buffer {
  const { width, height, data } = frame;
  const channels = 4;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));

  const at = (y: number, i: number): number =>
    y < 0 || i < 0 ? 0 : data[y * stride + i];

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i += 1) {
      const value = at(y, i);
      const left = i >= channels ? at(y, i - channels) : 0;
      const above = at(y - 1, i);
      const upLeft = i >= channels ? at(y - 1, i - channels) : 0;

      let encoded: number;
      switch (filter) {
        case 1:
          encoded = value - left;
          break;
        case 2:
          encoded = value - above;
          break;
        case 3:
          encoded = value - ((left + above) >> 1);
          break;
        case 4: {
          const p = left + above - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - above);
          const pc = Math.abs(p - upLeft);
          const predictor =
            pa <= pb && pa <= pc ? left : pb <= pc ? above : upLeft;
          encoded = value - predictor;
          break;
        }
        default:
          encoded = value;
      }
      raw[y * (stride + 1) + 1 + i] = encoded & 0xff;
    }
  }

  const chunk = (type: string, body: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    // The reader skips the CRC, so a placeholder keeps this helper honest
    // about being a test fixture rather than a second implementation.
    return Buffer.concat([
      length,
      Buffer.from(type, "ascii"),
      body,
      Buffer.alloc(4),
    ]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleFrame(width = 320, height = 192): Frame {
  const rand = mulberry32(19);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const base = 30 + Math.round((x / width) * 120);
      const speck = rand() < 0.02 ? 180 : 0;
      data[i] = base + speck;
      data[i + 1] = Math.round(base * 0.7) + speck;
      data[i + 2] = 200 - base + speck;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("reading a PNG", () => {
  for (const filter of [0, 1, 2, 3, 4]) {
    it(`reconstructs every pixel under row filter ${filter}`, () => {
      const frame = sampleFrame();
      const read = decodePng(encodePng(frame, filter));
      expect(read.width).toBe(frame.width);
      expect(read.height).toBe(frame.height);
      expect(read.data).toEqual(frame.data);
    });
  }

  it("names what it cannot read instead of guessing", () => {
    expect(() => decodePng(Buffer.from("this is not an image"))).toThrow(
      UnsupportedImageError,
    );
    const truncated = encodePng(sampleFrame(64, 64), 0).subarray(0, 40);
    expect(() => decodePng(truncated)).toThrow(UnsupportedImageError);
  });
});

describe("the forensic path end to end", () => {
  it("recovers the id from a watermarked frame saved as a PNG", () => {
    for (const id of [1, 4242, 65535]) {
      const exported = encodePng(embedWatermark(sampleFrame(), id), 4);
      expect(decodeWatermark(decodePng(exported))?.watermarkId).toBe(id);
    }
  });

  it("names nobody from a PNG that was never watermarked", () => {
    expect(decodeWatermark(decodePng(encodePng(sampleFrame(), 4)))).toBeNull();
  });
});
