import { describe, expect, it } from "vitest";
import {
  decodeNibble,
  decodeWatermarkEcc,
  encodeNibble,
  encodeWatermarkEcc,
} from "@/domain/watermark/ecc";

describe("watermark (8, 4) Hamming ECC", () => {
  it("encodes and decodes every 4-bit nibble perfectly without noise", () => {
    for (let d = 0; d < 16; d++) {
      const code = encodeNibble(d);
      const decoded = decodeNibble(code);
      expect(decoded.data).toBe(d);
      expect(decoded.corrected).toBe(false);
      expect(decoded.uncorrectable).toBe(false);
    }
  });

  it("detects and corrects a single bit flip in every position, for every nibble", () => {
    // All 8 positions, not 7. Bit 7 is the overall parity bit p4, which no
    // syndrome covers -- it used to fall through to "uncorrectable" even
    // though the four data bits were untouched. Sweeping every nibble as
    // well as every position keeps that class of hole from reopening.
    for (let data = 0; data < 16; data++) {
      const originalCodeword = encodeNibble(data);

      for (let bit = 0; bit < 8; bit++) {
        const corrupted = originalCodeword ^ (1 << bit);
        const decoded = decodeNibble(corrupted);

        expect(decoded.data).toBe(data);
        expect(decoded.corrected).toBe(true);
        expect(decoded.uncorrectable).toBe(false);
      }
    }
  });

  it("recovers the payload when the parity bit alone is flipped", () => {
    // Called out separately because this is the regression: p4 is one of the
    // eight bits, so roughly one in eight single-bit hits lands here.
    const data = 9;
    const corrupted = encodeNibble(data) ^ (1 << 7);
    const decoded = decodeNibble(corrupted);

    expect(decoded.data).toBe(data);
    expect(decoded.uncorrectable).toBe(false);
    expect(decoded.corrected).toBe(true);
  });

  it("detects every two-bit error as uncorrectable rather than guessing", () => {
    // A double error is the case the extended code exists to catch: it cannot
    // be repaired, and silently returning a plausible-looking id would name
    // the wrong tester as the source of a leak.
    for (let data = 0; data < 16; data++) {
      const originalCodeword = encodeNibble(data);

      for (let a = 0; a < 8; a++) {
        for (let b = a + 1; b < 8; b++) {
          const corrupted = originalCodeword ^ (1 << a) ^ (1 << b);
          const decoded = decodeNibble(corrupted);

          expect(decoded.uncorrectable).toBe(true);
          expect(decoded.corrected).toBe(false);
        }
      }
    }
  });

  it("encodes and decodes 16-bit watermark IDs with bit-flip resilience", () => {
    const testIds = [1, 42, 1337, 32768, 65535];

    for (const id of testIds) {
      const encoded = encodeWatermarkEcc(id);
      expect(encoded.length).toBe(4);

      // Corrupt byte 1 with a single bit flip
      const corrupted = [...encoded];
      corrupted[1] = corrupted[1]! ^ (1 << 3);

      const decoded = decodeWatermarkEcc(corrupted);
      expect(decoded.watermarkId).toBe(id);
      expect(decoded.errorsCorrected).toBe(1);
      expect(decoded.uncorrectableErrors).toBe(0);
    }
  });
});
