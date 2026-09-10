import { COORD_GRID_SIZE, STATE_SCORES } from "./config";
import type { Bucket, GameState } from "./types";

/**
 * Where a report happened, at a resolution coarse enough that two testers
 * hitting the same trap agree (SPEC.md §5.2 B).
 *
 * The grid is the whole idea: raw coordinates never match, and a plain
 * distance threshold makes the score depend on how far apart the two reports
 * happen to be rather than on whether they are in the same place.
 */

export function toBucket(
  state: GameState,
  gridSize: number = COORD_GRID_SIZE,
): Bucket {
  return {
    bx: Math.floor(state.x / gridSize),
    by: Math.floor(state.y / gridSize),
    bz: Math.floor(state.z / gridSize),
  };
}

export function bucketKey(bucket: Bucket): string {
  return `${bucket.bx},${bucket.by},${bucket.bz}`;
}

/** Chebyshev distance: 1 means the buckets touch, diagonals included. */
function bucketDistance(a: Bucket, b: Bucket): number {
  return Math.max(
    Math.abs(a.bx - b.bx),
    Math.abs(a.by - b.by),
    Math.abs(a.bz - b.bz),
  );
}

/**
 * A different scene scores zero, and because the weights are fixed that caps
 * the combined score below the attach threshold on its own. Two reports in
 * different scenes are different bugs however alike they read -- that is a
 * product rule, not a tuning accident.
 */
export function stateScore(
  report: GameState,
  issueScene: string,
  issueBucket: Bucket,
  gridSize: number = COORD_GRID_SIZE,
): number {
  if (report.scene !== issueScene) return STATE_SCORES.differentScene;

  const distance = bucketDistance(toBucket(report, gridSize), issueBucket);
  if (distance === 0) return STATE_SCORES.sameBucket;
  if (distance === 1) return STATE_SCORES.adjacentBucket;
  return STATE_SCORES.sameScene;
}

/**
 * The bucket most of an issue's occurrences sit in. Ties break on the lowest
 * key so the result never depends on the order reports arrived in.
 */
export function modalBucket(states: readonly GameState[]): Bucket {
  if (states.length === 0) return { bx: 0, by: 0, bz: 0 };

  const counts = new Map<string, { bucket: Bucket; count: number }>();
  for (const state of states) {
    const bucket = toBucket(state);
    const key = bucketKey(bucket);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { bucket, count: 1 });
    }
  }

  return [...counts.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]),
  )[0][1].bucket;
}

/** The scene most of an issue's occurrences name. Ties break alphabetically. */
export function modalScene(states: readonly GameState[]): string {
  if (states.length === 0) return "";

  const counts = new Map<string, number>();
  for (const state of states) {
    counts.set(state.scene, (counts.get(state.scene) ?? 0) + 1);
  }

  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0][0];
}
