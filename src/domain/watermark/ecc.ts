/**
 * Pure Error-Correcting Code (ECC) for Forensic Watermarking.
 *
 * Implements (8, 4) Extended Hamming Code across the 16-bit watermark payload.
 * Enables automatic single-bit error correction and double-bit error detection
 * per nibble to ensure watermark survival against lossy JPEG quantization.
 */

// Generator matrix G for (8, 4) extended Hamming code
// Parity bits: p1, p2, p3, plus overall parity p4 for SECDED (Single Error Correction, Double Error Detection)
export function encodeNibble(d: number): number {
  const d0 = (d >> 0) & 1;
  const d1 = (d >> 1) & 1;
  const d2 = (d >> 2) & 1;
  const d3 = (d >> 3) & 1;

  const p1 = d0 ^ d1 ^ d3;
  const p2 = d0 ^ d2 ^ d3;
  const p3 = d1 ^ d2 ^ d3;
  const p4 = p1 ^ p2 ^ d0 ^ p3 ^ d1 ^ d2 ^ d3;

  // Codeword: [p1, p2, d0, p3, d1, d2, d3, p4]
  return (
    (p1 << 0) |
    (p2 << 1) |
    (d0 << 2) |
    (p3 << 3) |
    (d1 << 4) |
    (d2 << 5) |
    (d3 << 6) |
    (p4 << 7)
  );
}

export interface DecodedNibble {
  readonly data: number; // 4-bit nibble (0-15)
  readonly corrected: boolean;
  readonly uncorrectable: boolean;
}

export function decodeNibble(codeword: number): DecodedNibble {
  const c = codeword & 0xff;
  const b0 = (c >> 0) & 1; // p1
  const b1 = (c >> 1) & 1; // p2
  const b2 = (c >> 2) & 1; // d0
  const b3 = (c >> 3) & 1; // p3
  const b4 = (c >> 4) & 1; // d1
  const b5 = (c >> 5) & 1; // d2
  const b6 = (c >> 6) & 1; // d3
  const b7 = (c >> 7) & 1; // p4

  // Syndromes s1, s2, s3
  const s1 = b0 ^ b2 ^ b4 ^ b6;
  const s2 = b1 ^ b2 ^ b5 ^ b6;
  const s3 = b3 ^ b4 ^ b5 ^ b6;
  const syndrome = s1 | (s2 << 1) | (s3 << 2);

  // Overall parity check
  let parityCount = 0;
  for (let i = 0; i < 8; i++) {
    if ((c >> i) & 1) parityCount++;
  }
  const overallParityValid = parityCount % 2 === 0;

  if (syndrome === 0 && overallParityValid) {
    // No error
    const d0 = b2;
    const d1 = b4;
    const d2 = b5;
    const d3 = b6;
    return {
      data: d0 | (d1 << 1) | (d2 << 2) | (d3 << 3),
      corrected: false,
      uncorrectable: false,
    };
  }

  if (syndrome !== 0 && !overallParityValid) {
    // Single bit error at 1-based position `syndrome`, inside the Hamming
    // block. Flip it back and read the data out of the repaired codeword.
    const correctedCode = c ^ (1 << (syndrome - 1));
    const d0 = (correctedCode >> 2) & 1;
    const d1 = (correctedCode >> 4) & 1;
    const d2 = (correctedCode >> 5) & 1;
    const d3 = (correctedCode >> 6) & 1;
    return {
      data: d0 | (d1 << 1) | (d2 << 2) | (d3 << 3),
      corrected: true,
      uncorrectable: false,
    };
  }

  if (syndrome === 0 && !overallParityValid) {
    // The overall parity bit p4 is the only bit not covered by s1..s3, so a
    // flip there leaves the syndrome clean while breaking total parity. The
    // four data bits are untouched: this is a corrected single-bit error, not
    // an uncorrectable one. Reporting it as uncorrectable made the decoder
    // reject one in eight recoverable frames -- and in forensics a frame
    // wrongly declared unreadable is a leak that goes unattributed.
    const d0 = b2;
    const d1 = b4;
    const d2 = b5;
    const d3 = b6;
    return {
      data: d0 | (d1 << 1) | (d2 << 2) | (d3 << 3),
      corrected: true,
      uncorrectable: false,
    };
  }

  // Double error detected (syndrome != 0 but overall parity even)
  const d0 = b2;
  const d1 = b4;
  const d2 = b5;
  const d3 = b6;
  return {
    data: d0 | (d1 << 1) | (d2 << 2) | (d3 << 3),
    corrected: false,
    uncorrectable: true,
  };
}

/**
 * Encodes a 16-bit watermark ID into 4 ECC-protected bytes.
 */
export function encodeWatermarkEcc(watermarkId: number): number[] {
  const clamped = watermarkId & 0xffff;
  const n0 = (clamped >> 0) & 0x0f;
  const n1 = (clamped >> 4) & 0x0f;
  const n2 = (clamped >> 8) & 0x0f;
  const n3 = (clamped >> 12) & 0x0f;

  return [
    encodeNibble(n0),
    encodeNibble(n1),
    encodeNibble(n2),
    encodeNibble(n3),
  ];
}

export interface DecodedWatermarkEcc {
  readonly watermarkId: number;
  readonly errorsCorrected: number;
  readonly uncorrectableErrors: number;
}

/**
 * Decodes 4 ECC bytes back into a 16-bit watermark ID, correcting single bit flips.
 */
export function decodeWatermarkEcc(
  bytes: readonly number[],
): DecodedWatermarkEcc {
  if (bytes.length < 4) {
    return { watermarkId: 0, errorsCorrected: 0, uncorrectableErrors: 4 };
  }

  let errorsCorrected = 0;
  let uncorrectableErrors = 0;
  const nibbles: number[] = [];

  for (let i = 0; i < 4; i++) {
    const res = decodeNibble(bytes[i] ?? 0);
    if (res.corrected) errorsCorrected++;
    if (res.uncorrectable) uncorrectableErrors++;
    nibbles.push(res.data);
  }

  const watermarkId =
    (nibbles[0]! << 0) |
    (nibbles[1]! << 4) |
    (nibbles[2]! << 8) |
    (nibbles[3]! << 12);

  return { watermarkId, errorsCorrected, uncorrectableErrors };
}
