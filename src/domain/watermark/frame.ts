import { GRID, ID_BITS, PAYLOAD_BITS, CHECKSUM_BITS, SUB } from "./config";

/**
 * An RGBA frame, shaped exactly like the browser's ImageData so a canvas can
 * be handed straight to these functions -- but declared here as a plain
 * structural type so the domain never touches a DOM API and the whole scheme
 * is testable in Node (SPEC.md §6.2).
 */
export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface BlockBounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * Block boundaries are computed as fractions of the image rather than as a
 * fixed pixel size, which is the whole of the downscale tolerance the spec
 * asks for: a frame reduced 2x or 3x tiles into the same 8x8 grid, and the
 * mean over a shrunken block is the mean over the source pixels it came from.
 */
export function blockBounds(
  frame: Pick<Frame, "width" | "height">,
  gx: number,
  gy: number,
): BlockBounds {
  return {
    x0: Math.floor((gx * frame.width) / GRID),
    x1: Math.floor(((gx + 1) * frame.width) / GRID),
    y0: Math.floor((gy * frame.height) / GRID),
    y1: Math.floor(((gy + 1) * frame.height) / GRID),
  };
}

/** Rec. 601 luma. Any consistent weighting works; this one is conventional. */
export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** CRC-8, polynomial 0x07. */
export function crc8(bytes: readonly number[]): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte & 0xff;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

/**
 * The 24-bit payload: the id, most significant bit first, then its checksum.
 */
export function payloadBits(watermarkId: number): number[] {
  const id = watermarkId & 0xffff;
  const checksum = crc8([(id >> 8) & 0xff, id & 0xff]);
  const bits: number[] = [];
  for (let i = ID_BITS - 1; i >= 0; i -= 1) bits.push((id >> i) & 1);
  for (let i = CHECKSUM_BITS - 1; i >= 0; i -= 1)
    bits.push((checksum >> i) & 1);
  return bits;
}

/**
 * Which payload bit a given block carries.
 *
 * 64 blocks over 24 bits gives the 16 id bits three copies each and the 8
 * checksum bits two, spread across the frame so that a redundant copy is
 * never adjacent to the block it backs up -- a bright object covering one
 * corner should not be able to take out all three readings of the same bit.
 */
export function bitIndexForBlock(blockIndex: number): number {
  return blockIndex % PAYLOAD_BITS;
}

/**
 * Which sub-cell of a block a pixel falls in, along one axis.
 */
export function subCellIndex(offset: number, span: number): number {
  return Math.min(SUB - 1, Math.floor((offset * SUB) / span));
}

/**
 * The sign a sub-cell's delta carries. Adjacent cells always disagree.
 *
 * This alternation is what makes the scheme readable at all. The obvious
 * design -- shift a whole block up or down and read it back against its
 * neighbouring blocks -- fails on real pictures, because the thing it has to
 * measure a 2-unit shift against is the brightness of a different part of the
 * image, which varies by hundreds. Measured on a game-like frame it came out
 * at 43% bit error, a coin flip. Alternating inside the block instead means
 * each cell is compared against the cell beside it, a few dozen pixels away
 * and almost always the same colour, and the picture subtracts itself out.
 */
export function subCellSign(sx: number, sy: number): 1 | -1 {
  return (sx + sy) % 2 === 0 ? 1 : -1;
}
