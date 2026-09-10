import { describe, expect, it } from "vitest";
import {
  SIGNATURE_MATCH_FLOOR,
  THRESHOLD_ATTACH,
  THRESHOLD_POSSIBLE,
  WEIGHTS,
} from "@/domain/triage/config";
import { emptyState, ingest, triageAll } from "@/domain/triage/cluster";
import type { TriageState } from "@/domain/triage/cluster";
import type { IncomingReport, Issue } from "@/domain/triage/types";

let counter = 0;
const at = (x: number, z: number) => ({
  scene: "atrium",
  x,
  y: 0,
  z,
  playtimeSec: 300,
});

function report(overrides: Partial<IncomingReport> = {}): IncomingReport {
  counter += 1;
  return {
    id: `r${counter}`,
    reporterId: `tester${counter}`,
    body: "The lift jams and the game stops responding",
    gameState: at(128, 96),
    systemInfo: {
      os: "Windows 11",
      browser: "Chrome 131",
      gpuRenderer: "AMD Radeon RX 6800",
      screen: "2560x1440",
    },
    consoleTail: [],
    createdAt: Date.now() + counter * 1000,
    ...overrides,
  };
}

/**
 * Unrelated reports from elsewhere in the build.
 *
 * Tests run against this rather than against a bare pair, because TF-IDF in a
 * two-document corpus is degenerate: a token shared by both documents gets
 * *less* weight than one unique to either, so a genuine paraphrase scores
 * lower than it would anywhere near production. A pair alone would be testing
 * an arithmetic corner the product never operates in.
 */
const BACKGROUND: readonly string[][] = [
  ["audio cuts out completely in the server room", "server-room", "20", "20"],
  ["textures flicker along the bridge railing", "bridge", "300", "12"],
  ["enemies spawn inside the wall near the gate", "courtyard", "60", "210"],
  ["frame rate tanks when the drones swarm", "courtyard", "64", "205"],
  ["subtitles overlap the health bar", "atrium", "10", "10"],
  ["the save prompt appears twice on quit", "menu", "0", "0"],
  ["my character floats above the stairs", "stairwell", "88", "40"],
  ["music restarts every time I open the map", "menu", "0", "0"],
  ["shadows flicker under the walkway", "bridge", "305", "15"],
  ["loot chest is empty after reload", "vault", "500", "500"],
];

function background(): TriageState {
  return triageAll(
    BACKGROUND.map(([body, scene, x, z]) =>
      report({
        body,
        gameState: {
          scene,
          x: Number(x),
          y: 0,
          z: Number(z),
          playtimeSec: 300,
        },
      }),
    ),
  );
}

/** Issues created after the background, i.e. the ones a test is about. */
function newIssues(state: TriageState): readonly Issue[] {
  return state.issues.slice(BACKGROUND.length);
}

describe("weights", () => {
  it("sum to 1, so a perfect match on every signal scores exactly 1", () => {
    const total =
      WEIGHTS.lexical + WEIGHTS.state + WEIGHTS.signature + WEIGHTS.environment;
    expect(total).toBeCloseTo(1, 10);
  });

  it("puts the possible-duplicate band below the attach threshold", () => {
    expect(THRESHOLD_POSSIBLE).toBeLessThan(THRESHOLD_ATTACH);
  });
});

describe("clustering", () => {
  it("clusters the same bug described in different words", () => {
    const first = ingest(
      background(),
      report({ body: "The lift jams and the game stops responding" }),
    );
    const second = ingest(
      first.state,
      report({ body: "Lift froze the game for me too, had to reload" }),
    );

    expect(second.decision.kind).toBe("attach");
    expect(newIssues(second.state)).toHaveLength(1);
    expect(newIssues(second.state)[0].reports).toHaveLength(2);
  });

  it("holds a pair that shares no vocabulary at all, rather than merging", () => {
    // Same bug, same place, same machine -- but "lift" and "elevator" are
    // different words and nothing else overlaps. The engine declines to
    // decide and hands it to a human. This is the intended behaviour, not a
    // shortfall: a wrongly merged report hides a real bug, a wrongly split
    // one costs a click.
    const first = ingest(
      background(),
      report({ body: "The lift jams and the game stops responding" }),
    );
    const second = ingest(
      first.state,
      report({ body: "Game froze solid when I took the elevator up" }),
    );

    expect(second.decision.kind).toBe("possible");
    expect(newIssues(second.state)).toHaveLength(1);
    expect(newIssues(second.state)[0].reports).toHaveLength(1);
    expect(newIssues(second.state)[0].possibleDuplicates).toHaveLength(1);
  });

  it("never clusters across scenes, however alike the wording", () => {
    const wording = "The lift jams and the game stops responding";
    const first = ingest(
      background(),
      report({ body: wording, gameState: at(128, 96) }),
    );
    const second = ingest(
      first.state,
      report({
        body: wording,
        gameState: { ...at(128, 96), scene: "loading-bay" },
      }),
    );

    // Byte-identical wording, identical machine, identical coordinates. Only
    // the scene differs, and that alone is enough.
    expect(second.decision.kind).toBe("new");
    expect(newIssues(second.state)).toHaveLength(2);
  });

  it("clusters on an identical stack even when the wording shares nothing", () => {
    const tail = [
      "[error] Uncaught TypeError: cannot read 'mesh' of null at Lift.tick (lift.js:214)",
    ];
    const state = triageAll([
      report({
        body: "Everything locked up the moment the doors started closing",
        consoleTail: tail,
        gameState: at(128, 96),
      }),
      report({
        body: "black screen, no idea why, the whole build died on me",
        consoleTail: [
          "[error] Uncaught TypeError: cannot read 'mesh' of null at Lift.tick (lift.js:999)",
        ],
        gameState: { ...at(400, 400), scene: "loading-bay" },
      }),
    ]);
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0].reports).toHaveLength(2);
  });

  it("floors a stack match at the configured value", () => {
    const tail = ["[error] RangeError in AudioMixer.flush"];
    const first = ingest(emptyState, report({ consoleTail: tail }));
    const second = ingest(
      first.state,
      report({
        body: "sound went completely wrong somewhere in the west corridor",
        consoleTail: tail,
        gameState: { ...at(999, 999), scene: "west-corridor" },
      }),
    );

    expect(second.decision.kind).toBe("attach");
    if (second.decision.kind !== "attach") return;
    expect(second.decision.score.signatureFloorApplied).toBe(true);
    expect(second.decision.score.combined).toBeGreaterThanOrEqual(
      SIGNATURE_MATCH_FLOOR,
    );
  });

  it("does not treat two clean consoles as a signature match", () => {
    const first = ingest(emptyState, report({ consoleTail: [] }));
    const second = ingest(
      first.state,
      report({
        body: "the checkpoint flag never triggers on the roof",
        consoleTail: [],
        gameState: { ...at(50, 50), scene: "roof" },
      }),
    );
    expect(second.decision.kind).toBe("new");
  });

  it("lands a borderline pair in the band, and holds it there", () => {
    const first = ingest(
      background(),
      report({
        body: "The lift jams and the game stops responding",
        gameState: at(128, 96),
      }),
    );
    const second = ingest(
      first.state,
      report({
        body: "Game froze solid when I took the elevator up",
        gameState: at(128, 96),
      }),
    );

    expect(second.decision.kind).toBe("possible");
    if (second.decision.kind !== "possible") return;
    expect(second.decision.score.combined).toBeGreaterThanOrEqual(
      THRESHOLD_POSSIBLE,
    );
    expect(second.decision.score.combined).toBeLessThan(THRESHOLD_ATTACH);

    // A possible duplicate is held, not counted. The occurrence count on the
    // board must never include something a human has not confirmed.
    expect(newIssues(second.state)).toHaveLength(1);
    expect(newIssues(second.state)[0].reports).toHaveLength(1);
    expect(newIssues(second.state)[0].possibleDuplicates).toHaveLength(1);
  });

  it("attaches to the highest scorer only, never to several", () => {
    let state = background();
    for (const body of [
      "The lift jams and the game stops responding",
      "lift jammed again, game stopped responding",
      "the lift jams every single time, game stops responding",
    ]) {
      state = ingest(state, report({ body })).state;
    }

    const issues = newIssues(state);
    expect(issues).toHaveLength(1);
    // Three reports in, three occurrences out. An occurrence count that
    // double-counts is worse than one that undercounts: the board sorts on it.
    expect(issues[0].reports).toHaveLength(3);
  });
});

describe("noise", () => {
  it("creates no issue for a report with nothing in it", () => {
    const state = triageAll([report({ body: "idk" })]);
    expect(state.issues).toHaveLength(0);
    expect(state.noise).toHaveLength(1);
  });

  it("creates no issue for a report with no domain-relevant token", () => {
    const state = triageAll([
      report({ body: "hello everyone how is it going today my friends" }),
    ]);
    expect(state.issues).toHaveLength(0);
    expect(state.noise).toHaveLength(1);
  });

  it("keeps a short report that shipped a real stack trace", () => {
    const state = triageAll([
      report({
        body: "broke",
        consoleTail: ["[error] TypeError in Lift.tick"],
      }),
    ]);
    // Under the length floor, so still noise -- but the rule that would have
    // caught it for vagueness defers to the stack.
    expect(state.noise).toHaveLength(1);

    const longer = triageAll([
      report({
        body: "no idea what happened here honestly",
        consoleTail: ["[error] TypeError in Lift.tick"],
      }),
    ]);
    expect(longer.issues).toHaveLength(1);
  });

  it("drops the same tester repeating themselves inside the window", () => {
    const now = Date.now();
    const body = "The lift jams and the game stops responding";
    const state = triageAll([
      report({ id: "a", reporterId: "t1", body, createdAt: now }),
      report({ id: "b", reporterId: "t1", body, createdAt: now + 5_000 }),
    ]);
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0].reports).toHaveLength(1);
    expect(state.noise).toHaveLength(1);
  });

  it("keeps the same words from a different tester", () => {
    const now = Date.now();
    const body = "The lift jams and the game stops responding";
    const state = triageAll([
      report({ id: "a", reporterId: "t1", body, createdAt: now }),
      report({ id: "b", reporterId: "t2", body, createdAt: now + 5_000 }),
    ]);
    expect(state.noise).toHaveLength(0);
    expect(state.issues[0].reports).toHaveLength(2);
  });

  it("keeps a repeat from the same tester after the window closes", () => {
    const now = Date.now();
    const body = "The lift jams and the game stops responding";
    const state = triageAll([
      report({ id: "a", reporterId: "t1", body, createdAt: now }),
      report({ id: "b", reporterId: "t1", body, createdAt: now + 120_000 }),
    ]);
    expect(state.noise).toHaveLength(0);
  });
});
