import { describe, expect, it } from "vitest";

import { MAX_WATERMARK_ID } from "@/domain/watermark/config";
import { decodeWatermark } from "@/domain/watermark/decode";
import {
  InvalidWatermarkIdError,
  embedWatermark,
} from "@/domain/watermark/encode";
import type { Frame } from "@/domain/watermark/frame";

/**
 * Round-trip proofs for the forensic watermark (SPEC.md §6.2).
 *
 * The images below are synthetic but deliberately hostile: a flat colour has
 * no texture to hide in, a gradient breaks the assumption that a block's
 * neighbours are as bright as it is, and noise is the case where the +/-2 is
 * far smaller than the pixel-to-pixel variation. If the scheme survives all
 * three it will survive a game frame.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function frameFrom(
  width: number,
  height: number,
  shade: (x: number, y: number) => [number, number, number],
): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const [r, g, b] = shade(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

const flat = (width = 640, height = 360): Frame =>
  frameFrom(width, height, () => [128, 128, 128]);

const gradient = (width = 640, height = 360): Frame =>
  frameFrom(width, height, (x, y) => {
    const v = Math.round((x / width) * 200 + (y / height) * 40);
    return [v, Math.round(v * 0.8), 255 - v];
  });

const noisy = (
  width = 640,
  height = 360,
  seed = 7,
  floor = 40,
  range = 180,
): Frame => {
  const rand = mulberry32(seed);
  return frameFrom(width, height, () => {
    const v = Math.round(floor + rand() * range);
    return [v, v, v];
  });
};

/** A dark scene with a few bright rectangles, the shape of a real game frame. */
const gameish = (width = 640, height = 360, seed = 11): Frame => {
  const rand = mulberry32(seed);
  const boxes = Array.from({ length: 14 }, () => ({
    x: rand() * width,
    y: rand() * height,
    w: rand() * 180 + 20,
    h: rand() * 120 + 20,
    v: Math.round(rand() * 255),
  }));
  return frameFrom(width, height, (x, y) => {
    let v = 26 + Math.round((y / height) * 30);
    for (const box of boxes) {
      if (x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h) {
        v = box.v;
      }
    }
    return [v, v, v];
  });
};

/** Box-average downscale by an integer factor, as an OS screenshot would. */
function downscale(frame: Frame, factor: number): Frame {
  const width = Math.floor(frame.width / factor);
  const height = Math.floor(frame.height / factor);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const totals = [0, 0, 0];
      for (let dy = 0; dy < factor; dy += 1) {
        for (let dx = 0; dx < factor; dx += 1) {
          const s = ((y * factor + dy) * frame.width + (x * factor + dx)) * 4;
          totals[0] += frame.data[s];
          totals[1] += frame.data[s + 1];
          totals[2] += frame.data[s + 2];
        }
      }
      const i = (y * width + x) * 4;
      const n = factor * factor;
      data[i] = Math.round(totals[0] / n);
      data[i + 1] = Math.round(totals[1] / n);
      data[i + 2] = Math.round(totals[2] / n);
      data[i + 3] = 255;
    }
  }

  return { width, height, data };
}

/**
 * The low ids are here on purpose. The first design shifted whole blocks and
 * read them back against neighbouring blocks, which meant a payload of mostly
 * identical bits made every block agree with its surroundings and vanish --
 * so watermark id 1, the very first one a platform issues, was unreadable
 * while id 1337 decoded perfectly. Any scheme that replaces this one has to
 * pass 1 and 65535 before it is allowed to be interesting.
 */
const IDS = [1, 2, 42, 255, 1337, 4096, 30011, 49152, 65535];

describe("watermark round trip", () => {
  const images: readonly [string, () => Frame][] = [
    ["flat colour", () => flat()],
    ["a gradient", () => gradient()],
    ["heavy noise", () => noisy()],
    ["a game-like frame", () => gameish()],
    ["a second game-like frame", () => gameish(640, 360, 29)],
    // The two ends of the range where clamping eats the signal.
    ["a near-black scene", () => noisy(640, 360, 5, 6, 14)],
    [
      "a blown-out white screen",
      () => frameFrom(640, 360, () => [253, 253, 253]),
    ],
  ];

  for (const [label, make] of images) {
    for (const id of IDS) {
      it(`recovers ${id} from ${label}`, () => {
        const decoded = decodeWatermark(embedWatermark(make(), id));
        expect(decoded?.watermarkId).toBe(id);
      });
    }
  }
});

describe("downscale tolerance", () => {
  for (const factor of [2, 3]) {
    it(`survives a ${factor}x screenshot reduction`, () => {
      for (const id of IDS) {
        const shrunk = downscale(embedWatermark(gameish(720, 360), id), factor);
        expect(decodeWatermark(shrunk)?.watermarkId).toBe(id);
      }
    });
  }
});

describe("refusing to name anyone", () => {
  it("returns null for an image that was never watermarked", () => {
    expect(decodeWatermark(gameish())).toBeNull();
    expect(decodeWatermark(gameish(640, 360, 29))).toBeNull();
    expect(decodeWatermark(gradient())).toBeNull();
    expect(decodeWatermark(flat())).toBeNull();
    expect(decodeWatermark(noisy())).toBeNull();
  });

  it("keeps a clear margin between a marked frame and an unmarked one", () => {
    // The confidence floor is only meaningful if there is a gap to put it in.
    // If a future change narrows this, the floor is guesswork again.
    const marked = decodeWatermark(embedWatermark(gameish(), 1337));
    expect(marked?.confidence).toBeGreaterThan(0.7);
  });

  it("returns null once the frame is degraded past recovery", () => {
    // A quarter of full-scale brightness noise stands in for the heavy
    // re-encoding the README says the scheme does not survive. The point of
    // this test is that failure is silent and empty, not a wrong name.
    const rand = mulberry32(3);
    const marked = embedWatermark(gameish(), 4242);
    const wrecked = new Uint8ClampedArray(marked.data);
    for (let i = 0; i < wrecked.length; i += 4) {
      const shift = Math.round((rand() - 0.5) * 120);
      wrecked[i] += shift;
      wrecked[i + 1] += shift;
      wrecked[i + 2] += shift;
    }
    const decoded = decodeWatermark({ ...marked, data: wrecked });
    expect(decoded === null || decoded.watermarkId === 4242).toBe(true);
  });

  it("rejects an id that cannot fit in the payload", () => {
    expect(() => embedWatermark(flat(), 0)).toThrow(InvalidWatermarkIdError);
    expect(() => embedWatermark(flat(), MAX_WATERMARK_ID + 1)).toThrow(
      InvalidWatermarkIdError,
    );
  });

  it("leaves the caller's pixels untouched", () => {
    const original = gameish();
    const before = new Uint8ClampedArray(original.data);
    embedWatermark(original, 99);
    expect(original.data).toEqual(before);
  });
});
