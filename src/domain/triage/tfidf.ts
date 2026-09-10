/**
 * TF-IDF over a campaign's reports.
 *
 * Vectors are sparse maps keyed by token, not arrays keyed by position. That
 * is what lets the engine hold no persisted vocabulary: there is no ordering
 * to agree on, so a vector built today is comparable with one built after the
 * corpus has grown (SPEC.md §4 notes, §5.2 A).
 */

export type Vector = ReadonlyMap<string, number>;

export interface Corpus {
  readonly documentCount: number;
  readonly documentFrequency: ReadonlyMap<string, number>;
}

/**
 * Smoothed IDF. The +1s keep an unseen token finite and every weight
 * positive, so cosine similarity stays in [0, 1] for non-negative vectors.
 */
function idf(corpus: Corpus, token: string): number {
  const df = corpus.documentFrequency.get(token) ?? 0;
  return Math.log((corpus.documentCount + 1) / (df + 1)) + 1;
}

export function buildCorpus(documents: readonly (readonly string[])[]): Corpus {
  const documentFrequency = new Map<string, number>();
  for (const tokens of documents) {
    for (const token of new Set(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  return { documentCount: documents.length, documentFrequency };
}

/** L2-normalised TF-IDF vector. Empty in, empty out. */
export function vectorise(tokens: readonly string[], corpus: Corpus): Vector {
  if (tokens.length === 0) return new Map();

  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const weights = new Map<string, number>();
  for (const [token, count] of counts) {
    weights.set(token, (count / tokens.length) * idf(corpus, token));
  }

  return normaliseVector(weights);
}

function normaliseVector(weights: Map<string, number>): Vector {
  let sumOfSquares = 0;
  for (const weight of weights.values()) sumOfSquares += weight * weight;
  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) return new Map();

  const unit = new Map<string, number>();
  for (const [token, weight] of weights) unit.set(token, weight / magnitude);
  return unit;
}

/** Mean of the member vectors, re-normalised. Empty for an empty issue. */
export function centroid(vectors: readonly Vector[]): Vector {
  if (vectors.length === 0) return new Map();

  const sums = new Map<string, number>();
  for (const vector of vectors) {
    for (const [token, weight] of vector) {
      sums.set(token, (sums.get(token) ?? 0) + weight);
    }
  }
  for (const [token, total] of sums) sums.set(token, total / vectors.length);

  return normaliseVector(sums);
}

/** Cosine similarity. Iterates the smaller vector. */
export function cosine(a: Vector, b: Vector): number {
  if (a.size === 0 || b.size === 0) return 0;

  const [small, large] = a.size <= b.size ? [a, b] : [b, a];

  let dot = 0;
  for (const [token, weight] of small) {
    const other = large.get(token);
    if (other !== undefined) dot += weight * other;
  }

  const magnitude = magnitudeOf(a) * magnitudeOf(b);
  return magnitude === 0 ? 0 : dot / magnitude;
}

function magnitudeOf(vector: Vector): number {
  let sumOfSquares = 0;
  for (const weight of vector.values()) sumOfSquares += weight * weight;
  return Math.sqrt(sumOfSquares);
}
