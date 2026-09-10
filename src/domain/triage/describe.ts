import { browserFamily, gpuFamily, osFamily } from "./traits";
import type { GameState, SystemInfo } from "./types";

/**
 * What an issue's occurrences have in common, as a sentence.
 *
 * "16 of 18 occurrences on AMD GPUs. 17 of 18 in Chrome. All within 4 units
 * of (128, 0, 96)." A sentence a developer can act on beats a pie chart
 * (SPEC.md §8) -- it already contains the conclusion the chart would make
 * them derive.
 *
 * Pure, so the wording is testable without a database, and built on the same
 * family classifiers the clusterer uses. Restating "which GPU is this"
 * separately on the server would let the board's headline sentence drift away
 * from the environment signal that helped group the reports in the first
 * place.
 */

export interface TraitObservation {
  readonly systemInfo: SystemInfo;
  readonly gameState: GameState;
}

export interface SharedTraits {
  readonly sentence: string;
  readonly gpu?: { readonly name: string; readonly count: number };
  readonly browser?: { readonly name: string; readonly count: number };
  readonly os?: { readonly name: string; readonly count: number };
  readonly scene?: string;
  readonly total: number;
}

/**
 * A trait is worth stating when most occurrences share it. Below this it is
 * noise dressed as insight: "9 of 18 on AMD" tells a developer nothing they
 * could not have guessed from market share.
 */
const NOTEWORTHY_SHARE = 0.6;

function topOf(values: readonly string[]): { name: string; count: number } {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const [name, count] = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0] ?? ["", 0];
  return { name, count };
}

export function describeSharedTraits(
  observations: readonly TraitObservation[],
): SharedTraits {
  const total = observations.length;
  if (total === 0) {
    return { sentence: "No occurrences recorded yet.", total: 0 };
  }

  const gpu = topOf(
    observations.map((o) => gpuFamily(o.systemInfo.gpuRenderer)),
  );
  const browser = topOf(
    observations.map((o) => browserFamily(o.systemInfo.browser)),
  );
  const os = topOf(observations.map((o) => osFamily(o.systemInfo.os)));
  const scene = topOf(observations.map((o) => o.gameState.scene));

  const parts: string[] = [];

  if (gpu.count / total >= NOTEWORTHY_SHARE && gpu.name !== "Other") {
    parts.push(`${gpu.count} of ${total} occurrences on ${gpu.name} GPUs`);
  }
  if (browser.count / total >= NOTEWORTHY_SHARE && browser.name !== "Other") {
    parts.push(`${browser.count} of ${total} in ${browser.name}`);
  }
  if (
    os.count / total >= NOTEWORTHY_SHARE &&
    os.name !== "Other" &&
    parts.length < 2
  ) {
    parts.push(`${os.count} of ${total} on ${os.name}`);
  }

  const inScene = observations.filter((o) => o.gameState.scene === scene.name);
  if (scene.name !== "" && inScene.length > 0) {
    const mean = {
      x: Math.round(average(inScene.map((o) => o.gameState.x))),
      y: Math.round(average(inScene.map((o) => o.gameState.y))),
      z: Math.round(average(inScene.map((o) => o.gameState.z))),
    };
    const radius = Math.max(
      1,
      Math.ceil(
        Math.max(
          ...inScene.map((o) =>
            Math.hypot(
              o.gameState.x - mean.x,
              o.gameState.y - mean.y,
              o.gameState.z - mean.z,
            ),
          ),
        ),
      ),
    );

    parts.push(
      scene.count === total
        ? `all within ${radius} units of (${mean.x}, ${mean.y}, ${mean.z}) in ${scene.name}`
        : `${scene.count} of ${total} in ${scene.name}, within ${radius} units of (${mean.x}, ${mean.y}, ${mean.z})`,
    );
  }

  // Nothing stood out. Say that plainly rather than inventing a pattern --
  // "no shared pattern" is itself useful: it points away from a hardware bug.
  const sentence =
    parts.length === 0
      ? `${total} ${total === 1 ? "occurrence" : "occurrences"} with no shared hardware or location pattern.`
      : `${parts.map(capitalise).join(". ")}.`;

  return {
    sentence,
    gpu: gpu.count > 0 ? gpu : undefined,
    browser: browser.count > 0 ? browser : undefined,
    os: os.count > 0 ? os : undefined,
    scene: scene.name === "" ? undefined : scene.name,
    total,
  };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function capitalise(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}
