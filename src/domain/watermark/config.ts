/**
 * Watermark parameters (SPEC.md §6.2).
 *
 * Every number here is a trade-off between invisibility and recoverability,
 * so each one is named and justified rather than inlined at its use site.
 */

/** The frame is tiled into GRID x GRID blocks. 8x8 = 64 carriers. */
export const GRID = 8;

/**
 * Each block is subdivided into SUB x SUB cells whose deltas alternate sign.
 *
 * Eight was measured, not chosen. Four and eight both recover every id from
 * every test frame at 1x, 2x and 3x; ten and above start losing bits as a 3x
 * reduction blurs neighbouring cells into each other and the pattern cancels
 * itself. Eight is therefore the finest grid that is still free, and finer is
 * better: on a near-black scene a +/-2 step is around 7% Weber contrast and
 * a coarse checkerboard of it is faintly perceptible, while the same step at
 * twice the spatial frequency sits much lower on the eye's contrast
 * sensitivity curve. See the README for what this does not fix.
 */
export const SUB = 8;

/** 16 bits of watermarkId. The ceiling of 65,535 grants is stated in the README. */
export const ID_BITS = 16;

/** 8 bits of CRC. Without it a decode of pure noise would name an innocent tester. */
export const CHECKSUM_BITS = 8;

export const PAYLOAD_BITS = ID_BITS + CHECKSUM_BITS;

/**
 * Luminance shift per sub-cell, in 0-255 units.
 *
 * At +/-2 the pattern is below the visible threshold on any real image but
 * still an order of magnitude above the rounding error of an 8-bit PNG. Going
 * higher would decode more reliably and show up as banding on flat colour,
 * which a tester would notice and a studio would refuse to ship.
 */
export const LUMINANCE_DELTA = 2;

/**
 * Below this decode strength we refuse to name anyone, even with a passing
 * checksum. A CRC-8 lets 1 in 256 random payloads through; on an accusation
 * of leaking an unreleased build that is not a good enough filter alone.
 *
 * 0.6 sits in a measured gap, not a guessed one. Across flat, gradient, noisy,
 * dark, blown-out and game-like frames at 1x, 2x and 3x, a watermarked frame
 * never scored below 0.72 and an unwatermarked one never above 0.42.
 */
export const MIN_CONFIDENCE = 0.6;

export const MAX_WATERMARK_ID = (1 << ID_BITS) - 1;
