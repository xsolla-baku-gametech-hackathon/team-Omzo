import type { EnvironmentTally, SystemInfo, TraitTally } from "./types";

/**
 * Environment correlation is the weakest signal at 0.10, and that is the
 * point: on its own it would cluster every Chrome user into one issue. It
 * exists so a GPU-specific bug clusters slightly tighter, and so the
 * shared-traits panel has real data to state as a sentence (SPEC.md §5.2 D).
 */

const GPU_FAMILIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(nvidia|geforce|rtx|gtx|quadro)\b/i, "NVIDIA"],
  [/\b(amd|radeon|rx\s?\d|vega)\b/i, "AMD"],
  [/\b(intel|iris|uhd graphics|hd graphics)\b/i, "Intel"],
  [/\b(apple|m1|m2|m3|m4)\b/i, "Apple"],
  [/\b(adreno|mali|powervr)\b/i, "Mobile"],
];

const OS_FAMILIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bwindows\b/i, "Windows"],
  [/\b(mac ?os|osx|darwin)\b/i, "macOS"],
  [/\b(linux|ubuntu|fedora|arch|steamos)\b/i, "Linux"],
  [/\bandroid\b/i, "Android"],
  [/\b(ios|iphone|ipad)\b/i, "iOS"],
];

const BROWSER_FAMILIES: ReadonlyArray<readonly [RegExp, string]> = [
  // Edge and Opera before Chrome: both identify as Chrome too.
  [/\b(edge|edg)\b/i, "Edge"],
  [/\b(opera|opr)\b/i, "Opera"],
  [/\bchrome\b/i, "Chrome"],
  [/\bfirefox\b/i, "Firefox"],
  [/\bsafari\b/i, "Safari"],
];

function family(
  value: string,
  patterns: ReadonlyArray<readonly [RegExp, string]>,
): string {
  for (const [pattern, name] of patterns) {
    if (pattern.test(value)) return name;
  }
  return "Other";
}

export function gpuFamily(renderer: string): string {
  return family(renderer, GPU_FAMILIES);
}

export function osFamily(os: string): string {
  return family(os, OS_FAMILIES);
}

export function browserFamily(browser: string): string {
  return family(browser, BROWSER_FAMILIES);
}

function tallyOne(values: readonly string[]): TraitTally {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function tallyEnvironment(
  systems: readonly SystemInfo[],
): EnvironmentTally {
  return {
    gpu: tallyOne(systems.map((s) => gpuFamily(s.gpuRenderer))),
    os: tallyOne(systems.map((s) => osFamily(s.os))),
    browser: tallyOne(systems.map((s) => browserFamily(s.browser))),
  };
}

function shareOf(tally: TraitTally, value: string, total: number): number {
  if (total === 0) return 0;
  return (tally.get(value) ?? 0) / total;
}

/**
 * The mean share of the issue's occurrences that share this report's GPU, OS
 * and browser family. A bug that only AMD cards hit scores high for the next
 * AMD reporter and low for an NVIDIA one.
 */
export function environmentScore(
  system: SystemInfo,
  tally: EnvironmentTally,
  occurrences: number,
): number {
  if (occurrences === 0) return 0;
  return (
    (shareOf(tally.gpu, gpuFamily(system.gpuRenderer), occurrences) +
      shareOf(tally.os, osFamily(system.os), occurrences) +
      shareOf(tally.browser, browserFamily(system.browser), occurrences)) /
    3
  );
}
