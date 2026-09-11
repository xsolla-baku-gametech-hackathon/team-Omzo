/**
 * Trust Level is the public face of signal score: 1–100 instead of 0–200.
 *
 * It is derived, never stored. Verified bugs and noise already move
 * `signalScore`; this mapping only decides how that standing reads on an
 * applicant row or a tester profile.
 */

import {
  SIGNAL_SCORE_MAX,
  SIGNAL_SCORE_MIN,
} from "@/domain/rewards/signalScore";

export const TRUST_LEVEL_MIN = 1;
export const TRUST_LEVEL_MAX = 100;

export type TrustTier = "New" | "Proven" | "Veteran";

export function trustLevelOf(signalScore: number): number {
  const clamped = Math.max(
    SIGNAL_SCORE_MIN,
    Math.min(SIGNAL_SCORE_MAX, Math.round(signalScore)),
  );
  return Math.max(
    TRUST_LEVEL_MIN,
    Math.min(TRUST_LEVEL_MAX, Math.round(clamped / 2)),
  );
}

export function trustTierOf(level: number): TrustTier {
  if (level >= 67) return "Veteran";
  if (level >= 34) return "Proven";
  return "New";
}
