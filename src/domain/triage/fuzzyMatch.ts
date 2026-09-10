/**
 * Pure fuzzy string matching and Levenshtein similarity metric.
 *
 * Provides typo tolerance for playtest bug reports where human testers
 * write misspelled game terms (e.g. "colision", "cliping", "respawnn").
 *
 * Pure functional domain logic with zero external dependencies.
 */

/**
 * Computes the Levenshtein edit distance between two strings using
 * a space-optimized dynamic programming array (O(min(N, M)) space).
 */
export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  let a = s1;
  let b = s2;
  if (a.length > b.length) {
    a = s2;
    b = s1;
  }

  const row = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) {
    row[i] = i;
  }

  for (let i = 1; i <= b.length; i++) {
    let prev = row[0]!;
    row[0] = i;

    for (let j = 1; j <= a.length; j++) {
      const temp = row[j]!;
      if (b[i - 1] === a[j - 1]) {
        row[j] = prev;
      } else {
        row[j] = 1 + Math.min(prev, row[j]!, row[j - 1]!);
      }
      prev = temp;
    }
  }

  return row[a.length]!;
}

/**
 * Normalized Levenshtein similarity score between 0.0 (completely different)
 * and 1.0 (identical).
 */
export function stringSimilarity(s1: string, s2: string): number {
  const str1 = s1.trim().toLowerCase();
  const str2 = s2.trim().toLowerCase();

  if (str1 === str2) return 1.0;
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(str1, str2);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Returns true if the similarity score between two words meets or exceeds the threshold.
 */
export function isFuzzyMatch(s1: string, s2: string, threshold: number = 0.8): boolean {
  return stringSimilarity(s1, s2) >= threshold;
}

/**
 * Finds the closest matching word in a dictionary of keywords.
 */
export function findClosestKeyword(
  word: string,
  dictionary: ReadonlyArray<string> | ReadonlySet<string>,
  threshold: number = 0.75,
): string | null {
  const target = word.trim().toLowerCase();
  let bestMatch: string | null = null;
  let bestScore = -1;

  for (const candidate of dictionary) {
    const score = stringSimilarity(target, candidate);
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}
