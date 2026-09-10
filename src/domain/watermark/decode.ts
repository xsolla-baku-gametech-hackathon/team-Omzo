import {
  GRID,
  ID_BITS,
  LUMINANCE_DELTA,
  MIN_CONFIDENCE,
  PAYLOAD_BITS,
  SUB,
} from "./config";
import {
  blockBounds,
  bitIndexForBlock,
  crc8,
  luminance,
  subCellIndex,
  subCellSign,
} from "./frame";
import type { Frame } from "./frame";

export interface DecodedWatermark {
  readonly watermarkId: number;
  /**
   * How strongly the frame carried the pattern, 0 to 1, where 1 is every
   * block reading at full amplitude. Measured, not asserted: report it in the
   * interface so a studio can see the difference between a clean frame and a
   * marginal one rather than being handed a name and asked to trust it.
   */
  readonly confidence: number;
}

/**
 * How much each block's cells agree with the embedded checkerboard, as a
 * fraction of full amplitude, signed by the bit the block is claiming.
 *
 * Reading a block against its own cells rather than against other blocks is
 * what makes this work on a real picture: adjacent cells are a few dozen
 * pixels apart and nearly always the same colour, so the image cancels and
 * what is left is the +/-2 we put there.
 */
function blockEvidence(frame: Frame): number[] {
  const evidence: number[] = [];
  const cellCount = SUB * SUB;

  for (let gy = 0; gy < GRID; gy += 1) {
    for (let gx = 0; gx < GRID; gx += 1) {
      const { x0, x1, y0, y1 } = blockBounds(frame, gx, gy);
      const spanX = x1 - x0;
      const spanY = y1 - y0;
      if (spanX <= 0 || spanY <= 0) {
        evidence.push(0);
        continue;
      }

      const totals = new Array<number>(cellCount).fill(0);
      const counts = new Array<number>(cellCount).fill(0);

      for (let y = y0; y < y1; y += 1) {
        const sy = subCellIndex(y - y0, spanY);
        for (let x = x0; x < x1; x += 1) {
          const sx = subCellIndex(x - x0, spanX);
          const cell = sy * SUB + sx;
          const i = (y * frame.width + x) * 4;
          totals[cell] += luminance(
            frame.data[i],
            frame.data[i + 1],
            frame.data[i + 2],
          );
          counts[cell] += 1;
        }
      }

      let sum = 0;
      for (let sy = 0; sy < SUB; sy += 1) {
        for (let sx = 0; sx < SUB; sx += 1) {
          const cell = sy * SUB + sx;
          if (counts[cell] === 0) continue;
          sum += subCellSign(sx, sy) * (totals[cell] / counts[cell]);
        }
      }

      // Capped at full amplitude. Without the cap a single block lying across
      // a hard edge -- a white UI panel against a dark room -- reads hundreds
      // of units strong and outvotes the two clean copies of the same bit.
      const normalised = sum / (cellCount * LUMINANCE_DELTA);
      evidence.push(Math.max(-1, Math.min(1, normalised)));
    }
  }

  return evidence;
}

/**
 * Recovers a watermark id from an image, or returns null (SPEC.md §6.2).
 *
 * Null is the honest answer for an unwatermarked image, a heavily re-encoded
 * one, or a photograph of a monitor. Naming a tester is an accusation, so the
 * decoder refuses on a failed checksum or a weak margin rather than returning
 * its best guess.
 */
export function decodeWatermark(frame: Frame): DecodedWatermark | null {
  if (frame.width < GRID * SUB || frame.height < GRID * SUB) return null;

  const evidence = blockEvidence(frame);

  // Each payload bit is carried by two or three blocks. Summing the signed
  // evidence rather than counting hard votes lets a confident reading outweigh
  // a block that fell on a dark edge, and never leaves a two-copy bit tied.
  const perBit = new Array<number>(PAYLOAD_BITS).fill(0);
  for (let block = 0; block < evidence.length; block += 1) {
    perBit[bitIndexForBlock(block)] += evidence[block];
  }

  const bits = perBit.map((value) => (value > 0 ? 1 : 0));

  const confidence =
    evidence.reduce((total, value) => total + Math.abs(value), 0) /
    evidence.length;

  let watermarkId = 0;
  for (let i = 0; i < ID_BITS; i += 1) {
    watermarkId = (watermarkId << 1) | bits[i];
  }

  let checksum = 0;
  for (let i = ID_BITS; i < PAYLOAD_BITS; i += 1) {
    checksum = (checksum << 1) | bits[i];
  }

  if (checksum !== crc8([(watermarkId >> 8) & 0xff, watermarkId & 0xff])) {
    return null;
  }
  if (watermarkId === 0) return null;
  if (confidence < MIN_CONFIDENCE) return null;

  return { watermarkId, confidence };
}
