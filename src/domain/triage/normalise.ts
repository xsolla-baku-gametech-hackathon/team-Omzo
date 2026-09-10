import { PHRASE_SYNONYMS, STOPWORDS, TOKEN_SYNONYMS } from "./config";

/**
 * Lowercase, strip punctuation, collapse whitespace. Apostrophes are removed
 * rather than spaced, so "can't" becomes "cant" and stays one word -- the
 * progression keywords in config.ts are written to match that.
 */
export function normalise(body: string): string {
  return body
    .toLowerCase()
    .replace(/[‘’ʼ']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A deliberately small suffix stemmer.
 *
 * Without it, ordinary English inflection splits words that mean the same
 * thing: "the lift jams / the game stops responding" and "lift jammed again,
 * game stopped responding" describe one bug in almost the same words, and
 * score 0.43 lexically because jams/jammed and stops/stopped are four tokens
 * rather than two.
 *
 * It is not Porter. It handles the four endings that actually appear in bug
 * reports and leaves everything else alone, because an over-eager stemmer
 * collides unrelated words and every collision merges two real bugs.
 */
const DOUBLED = /([bdfgklmnprt])\1$/;

export function stem(token: string): string {
  if (token.length < 4) return token;

  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (
    token.endsWith("sses") ||
    token.endsWith("shes") ||
    token.endsWith("ches")
  ) {
    return token.slice(0, -2);
  }
  if (token.endsWith("ing") && token.length > 5) {
    return undouble(token.slice(0, -3));
  }
  if (token.endsWith("ed") && token.length > 4) {
    return undouble(token.slice(0, -2));
  }
  // Plural or third person, but not "ss" (glass), "us" (status) or "is".
  if (
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    !token.endsWith("us") &&
    !token.endsWith("is")
  ) {
    return token.slice(0, -1);
  }
  return token;
}

/** "jamm" -> "jam", "stopp" -> "stop". Leaves "fall" and "miss" alone. */
function undouble(stemmed: string): string {
  return DOUBLED.test(stemmed) ? stemmed.slice(0, -1) : stemmed;
}

const PHRASE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> =
  PHRASE_SYNONYMS.map(
    ([phrase, replacement]) =>
      [new RegExp(`\\b${phrase}\\b`, "g"), replacement] as const,
  );

/**
 * Normalise, collapse domain phrases, map token synonyms, drop stopwords.
 *
 * Order matters: phrases are collapsed first because several contain
 * stopwords ("stuck in" would otherwise lose its "in" and become plain
 * "stuck", which means something weaker).
 */
export function tokenise(body: string): string[] {
  let text = normalise(body);

  for (const [pattern, replacement] of PHRASE_PATTERNS) {
    text = text.replace(pattern, replacement);
  }

  const tokens: string[] = [];
  for (const raw of text.split(" ")) {
    if (raw.length === 0) continue;

    // Synonyms first on the raw word, since the map already lists inflected
    // forms and its values are canonical. Anything it does not know gets
    // stemmed, then offered to the map once more.
    const direct = TOKEN_SYNONYMS.get(raw);
    const token =
      direct ??
      (() => {
        const stemmed = stem(raw);
        return TOKEN_SYNONYMS.get(stemmed) ?? stemmed;
      })();

    if (token.length < 2) continue;
    if (STOPWORDS.has(token)) continue;
    tokens.push(token);
  }
  return tokens;
}
