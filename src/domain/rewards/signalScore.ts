/**
 * A tester's standing, as a number between 0 and 200 (SPEC.md §6.4).
 *
 * It starts at 100 -- neutral, not zero -- because a new tester has not
 * earned suspicion any more than they have earned trust. The deltas are
 * deliberately asymmetric: finding something new is worth more than adding to
 * something known, and filing noise costs more than a duplicate does, because
 * noise is the only one of the two that wastes a human's attention.
 */

export const SIGNAL_SCORE_START = 100;
export const SIGNAL_SCORE_MIN = 0;
export const SIGNAL_SCORE_MAX = 200;

export const SIGNAL_DELTAS = {
  /** First to report an issue that the studio then verified. */
  verifiedUniqueIssue: 3,
  /** Reported something that joined an issue later verified. */
  attachedToVerified: 1,
  /** Filed noise. */
  noise: -2,
  /** Piled onto an issue that was already well established. */
  bulkDuplicate: -1,
} as const;

export type SignalEvent = keyof typeof SIGNAL_DELTAS;

/**
 * Below this, a tester is rate-limited to five reports an hour.
 *
 * Not banned. Someone who has filed noise may still find the crash nobody
 * else did, and a platform that silences its worst-scoring testers stops
 * hearing from exactly the people who play in the strangest ways.
 */
export const RATE_LIMIT_BELOW_SCORE = 40;
export const RATE_LIMITED_REPORTS_PER_HOUR = 5;

export function clampSignalScore(score: number): number {
  return Math.max(
    SIGNAL_SCORE_MIN,
    Math.min(SIGNAL_SCORE_MAX, Math.round(score)),
  );
}

export function applySignalEvent(score: number, event: SignalEvent): number {
  return clampSignalScore(score + SIGNAL_DELTAS[event]);
}

export function applySignalEvents(
  score: number,
  events: readonly SignalEvent[],
): number {
  return events.reduce(applySignalEvent, score);
}

export function isRateLimited(score: number): boolean {
  return score < RATE_LIMIT_BELOW_SCORE;
}

/** How many reports an hour this tester may file. */
export function hourlyReportAllowance(score: number): number {
  return isRateLimited(score) ? RATE_LIMITED_REPORTS_PER_HOUR : Infinity;
}
