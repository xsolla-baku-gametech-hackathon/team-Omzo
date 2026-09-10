import { DOMAIN_TOKENS, DUPLICATE_WINDOW_MS, NOISE_MIN_LENGTH } from "./config";
import { stem, tokenise } from "./normalise";

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

/**
 * The lexicon is stemmed once, because the tokens arriving here are stemmed
 * too. Left unstemmed it rejects "flashes" for not being "flashing", which is
 * how nine genuine reports in the seed corpus were first thrown away.
 */
const DOMAIN_STEMS: ReadonlySet<string> = new Set([...DOMAIN_TOKENS].map(stem));

export interface NoiseInput {
  readonly body: string;
  readonly normalisedBody: string;
  readonly tokens: readonly string[];
  /** A non-empty log signature is evidence on its own, whatever was typed. */
  readonly signature: string;
  readonly createdAt: number;
  /**
   * The scene the report came from. A report that names where it happened is
   * about the game, whatever else it says -- and no fixed lexicon can hold a
   * given studio's own nouns ("the ramp", "the vault", "the drones"), so the
   * build's own vocabulary has to count as domain vocabulary.
   */
  readonly scene: string;
  /** Earlier reports from the same tester. Others' reports are irrelevant. */
  readonly priorFromSameReporter: readonly PriorReport[];
}

export function isNoise(input: NoiseInput): boolean {
  if (input.normalisedBody.length < NOISE_MIN_LENGTH) return true;

  // A stack trace outranks the sentence. Someone who types "idk it broke" but
  // ships a real TypeError has told us more than someone who writes a
  // paragraph about nothing.
  if (input.signature === "") {
    const sceneTokens = new Set(tokenise(input.scene));
    const relevant = input.tokens.some(
      (token) => DOMAIN_STEMS.has(token) || sceneTokens.has(token),
    );
    if (!relevant) return true;
  }

  return input.priorFromSameReporter.some(
    (prior) =>
      prior.body === input.body &&
      input.createdAt - prior.createdAt <= DUPLICATE_WINDOW_MS &&
      input.createdAt >= prior.createdAt,
  );
}
