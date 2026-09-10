import type { IncomingReport, SystemInfo } from "../../src/domain/triage/types";
import type { BugTemplate } from "./bugTemplates";
import { BUG_TEMPLATES } from "./bugTemplates";
import { NOISE_BODIES } from "./noise";

/**
 * Turns the hand-written templates into reports.
 *
 * Deterministic throughout: same seed, same corpus, byte for byte. A fixture
 * that moves under you cannot be used to test order-independence, because
 * there would be no way to tell a clustering change from a data change.
 */

/** mulberry32. Small, fast, and good enough for placing test data. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Coherent machines. A real corpus never has an Apple GPU on Windows. */
const MACHINES: readonly SystemInfo[] = [
  {
    os: "Windows 11",
    browser: "Chrome 131",
    gpuRenderer: "AMD Radeon RX 6800 XT",
    screen: "2560x1440",
    memoryGb: 16,
  },
  {
    os: "Windows 11",
    browser: "Chrome 130",
    gpuRenderer: "AMD Radeon RX 7900 XT",
    screen: "3440x1440",
    memoryGb: 32,
  },
  {
    os: "Windows 10",
    browser: "Firefox 133",
    gpuRenderer: "AMD Radeon RX 6600",
    screen: "1920x1080",
    memoryGb: 16,
  },
  {
    os: "Windows 11",
    browser: "Edge 131",
    gpuRenderer: "NVIDIA GeForce RTX 4060",
    screen: "1920x1080",
    memoryGb: 16,
  },
  {
    os: "Windows 11",
    browser: "Chrome 131",
    gpuRenderer: "NVIDIA GeForce RTX 3070",
    screen: "2560x1440",
    memoryGb: 32,
  },
  {
    os: "Windows 10",
    browser: "Chrome 129",
    gpuRenderer: "NVIDIA GeForce GTX 1660 Ti",
    screen: "1920x1080",
    memoryGb: 8,
  },
  {
    os: "Windows 11",
    browser: "Firefox 132",
    gpuRenderer: "Intel Iris Xe Graphics",
    screen: "1920x1200",
    memoryGb: 8,
  },
  {
    os: "Ubuntu 22.04",
    browser: "Firefox 133",
    gpuRenderer: "AMD Radeon RX 6700 XT",
    screen: "2560x1440",
    memoryGb: 16,
  },
  {
    os: "macOS 14.4",
    browser: "Safari 17.4",
    gpuRenderer: "Apple M2 Pro",
    screen: "3024x1964",
    memoryGb: 16,
  },
  {
    os: "macOS 15.1",
    browser: "Chrome 131",
    gpuRenderer: "Apple M3",
    screen: "2880x1864",
    memoryGb: 16,
  },
];

const TESTERS: readonly string[] = Array.from(
  { length: 48 },
  (_, i) => `tester-${String(i + 1).padStart(2, "0")}`,
);

/**
 * Testers are not interchangeable either.
 *
 * In any playtest a handful of people file dozens of reports and most file
 * one or two. Drawing reporters uniformly would give all 48 testers the same
 * output, which flattens the leaderboard, makes the signal score meaningless
 * and hides the whole point of paying the *first* reporter -- with uniform
 * volume, being first is pure luck rather than a consequence of playing more.
 *
 * Zipf-ish: weight 1/(rank^1.1).
 */
const TESTER_WEIGHTS: readonly number[] = TESTERS.map(
  (_, i) => 1 / Math.pow(i + 1, 1.1),
);
const TESTER_WEIGHT_TOTAL = TESTER_WEIGHTS.reduce((a, b) => a + b, 0);

function pickTester(random: () => number): string {
  let target = random() * TESTER_WEIGHT_TOTAL;
  for (let i = 0; i < TESTERS.length; i += 1) {
    target -= TESTER_WEIGHTS[i];
    if (target <= 0) return TESTERS[i];
  }
  return TESTERS[TESTERS.length - 1];
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function machineFor(template: BugTemplate, random: () => number): SystemInfo {
  if (template.gpuSkew !== undefined && random() < 0.85) {
    const skewed = MACHINES.filter((m) =>
      m.gpuRenderer.toLowerCase().includes(template.gpuSkew!.toLowerCase()),
    );
    if (skewed.length > 0) return pick(skewed, random);
  }
  return pick(MACHINES, random);
}

const AMBIENT_LOG_LINES: readonly string[] = [
  "[info] scene loaded in {n}ms",
  "[debug] fps {n}",
  "[info] autosave written",
  "[debug] entity count {n}",
];

function fill(line: string, random: () => number): string {
  return line
    .replace(/\{n\}/g, () => String(Math.floor(random() * 9000) + 100))
    .replace(/\{id\}/g, () => {
      let id = "c";
      for (let i = 0; i < 24; i += 1) {
        id += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
      }
      return id;
    });
}

function consoleTailFor(template: BugTemplate, random: () => number): string[] {
  const tail = [fill(pick(AMBIENT_LOG_LINES, random), random)];
  if (template.errorLines.length > 0 && random() < template.errorRate) {
    for (const line of template.errorLines) tail.push(fill(line, random));
  }
  tail.push(fill(pick(AMBIENT_LOG_LINES, random), random));
  return tail;
}

export interface FixtureOptions {
  readonly seed?: number;
  /** Epoch ms the corpus starts at. */
  readonly startedAt?: number;
}

/**
 * Every report the seed writes: the fourteen bugs, the noise, and two
 * deliberate same-tester repeats inside the duplicate window so that rule is
 * exercised by the fixture and not only by a unit test.
 */
export function expandFixture(options: FixtureOptions = {}): IncomingReport[] {
  const random = rng(options.seed ?? 20260910);
  const startedAt = options.startedAt ?? Date.UTC(2026, 8, 1, 9, 0, 0);
  const reports: IncomingReport[] = [];
  let tick = 0;

  const nextAt = (): number => {
    tick += 1;
    // Reports land 30-120s apart, so nothing collides with the 60s duplicate
    // window by accident.
    return startedAt + tick * 90_000;
  };

  for (const template of BUG_TEMPLATES) {
    if (template.reportCount > template.paraphrases.length) {
      throw new Error(
        `${template.key} wants ${template.reportCount} reports from ` +
          `${template.paraphrases.length} paraphrases. Padding a bug out by ` +
          `repeating a sentence would invent agreement the clusterer has ` +
          `not earned -- write more sentences instead.`,
      );
    }

    template.paraphrases
      .slice(0, template.reportCount)
      .forEach((body, index) => {
        const [cx, cy, cz] = template.centre;
        const jitter = (): number =>
          template.spread === 0 ? 0 : (random() - 0.5) * 2 * template.spread;

        reports.push({
          id: `${template.key}-${String(index + 1).padStart(3, "0")}`,
          reporterId: pickTester(random),
          body,
          gameState: {
            scene: template.scene,
            x: Number((cx + jitter()).toFixed(2)),
            y: cy,
            z: Number((cz + jitter()).toFixed(2)),
            playtimeSec: Math.floor(random() * 2400) + 120,
          },
          systemInfo: machineFor(template, random),
          consoleTail: consoleTailFor(template, random),
          createdAt: nextAt(),
        });
      });
  }

  NOISE_BODIES.forEach((body, index) => {
    reports.push({
      id: `noise-${String(index + 1).padStart(3, "0")}`,
      reporterId: pickTester(random),
      body,
      gameState: {
        scene: pick(["atrium", "menu", "courtyard"], random),
        x: 0,
        y: 0,
        z: 0,
        playtimeSec: Math.floor(random() * 600),
      },
      systemInfo: pick(MACHINES, random),
      consoleTail: [fill(pick(AMBIENT_LOG_LINES, random), random)],
      createdAt: nextAt(),
    });
  });

  // Two testers double-submitting the same sentence seconds apart -- an
  // impatient double-tap on F1, which is what the duplicate rule is for.
  for (const [index, source] of [reports[0], reports[40]].entries()) {
    reports.push({
      ...source,
      id: `repeat-${index + 1}`,
      createdAt: source.createdAt + 8_000,
    });
  }

  return reports;
}

/** Deterministic shuffle, for the order-independence test. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = rng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
