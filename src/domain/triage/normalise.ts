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
    const mapped = TOKEN_SYNONYMS.get(raw) ?? raw;
    if (mapped.length < 2) continue;
    if (STOPWORDS.has(mapped)) continue;
    tokens.push(mapped);
  }
  return tokens;
}
