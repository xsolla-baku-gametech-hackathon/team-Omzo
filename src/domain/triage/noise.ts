import { DOMAIN_TOKENS, DUPLICATE_WINDOW_MS, NOISE_MIN_LENGTH } from "./config";

/**
 * Noise never creates an issue, never earns a reward and costs the reporter
 * signal score (SPEC.md §5.4) -- so a false positive here takes money and
 * standing from someone who filed a real report. Each rule below is written
 * to be sure rather than clever.
 *
 * Noise is still kept and still shown in the raw stream. The studio must be
 * able to audit what was set aside on their behalf.
 */

export interface PriorReport {
  readonly body: string;
  readonly createdAt: number;
}

export interface NoiseInput {
  readonly body: string;
  readonly normalisedBody: string;
  readonly tokens: readonly string[];
  /** A non-empty log signature is evidence on its own, whatever was typed. */
  readonly signature: string;
  readonly createdAt: number;
  /** Earlier reports from the same tester. Others' reports are irrelevant. */
  readonly priorFromSameReporter: readonly PriorReport[];
}

export function isNoise(input: NoiseInput): boolean {
  if (input.normalisedBody.length < NOISE_MIN_LENGTH) return true;

  // A stack trace outranks the sentence. Someone who types "idk it broke" but
  // ships a real TypeError has told us more than someone who writes a
  // paragraph about nothing.
  if (input.signature === "") {
    const hasDomainToken = input.tokens.some((token) =>
      DOMAIN_TOKENS.has(token),
    );
    if (!hasDomainToken) return true;
  }

  return input.priorFromSameReporter.some(
    (prior) =>
      prior.body === input.body &&
      input.createdAt - prior.createdAt <= DUPLICATE_WINDOW_MS &&
      input.createdAt >= prior.createdAt,
  );
}
