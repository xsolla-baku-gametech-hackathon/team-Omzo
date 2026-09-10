import { describe, expect, it } from "vitest";
import { triageAll } from "@/domain/triage/cluster";
import type { TriageState } from "@/domain/triage/cluster";
import { BUG_TEMPLATES } from "../prisma/fixtures/bugTemplates";
import { expandFixture, shuffled } from "../prisma/fixtures/expand";

/**
 * The whole engine, against the whole seed corpus.
 *
 * Every other test in this suite examines one signal or one pair. This one
 * asks the only question the product is judged on: does a campaign's worth of
 * real writing collapse into a board a developer can act on, and does it do
 * so regardless of the order the reports arrived in?
 */

const REPORTS = expandFixture();
const SHUFFLE_SEEDS = [1, 2, 3, 42, 1234];

/** Reports are id'd by the bug that produced them, so grouping is checkable. */
const templateOf = (id: string): string => id.replace(/-\d+$/, "");

function issueCountsByTemplate(state: TriageState): Map<string, number> {
  const biggest = new Map<string, number>();
  for (const issue of state.issues) {
    const counts = new Map<string, number>();
    for (const report of issue.reports) {
      const key = templateOf(report.id);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, n] of counts) {
      biggest.set(key, Math.max(biggest.get(key) ?? 0, n));
    }
  }
  return biggest;
}

/** Issues holding reports produced by more than one bug. */
function impureIssues(state: TriageState): number {
  let impure = 0;
  for (const issue of state.issues) {
    const keys = new Set(issue.reports.map((r) => templateOf(r.id)));
    keys.delete("repeat");
    keys.delete("noise");
    if (keys.size > 1) impure += 1;
  }
  return impure;
}

function topThree(state: TriageState): string[] {
  return [...state.issues]
    .sort((a, b) => b.reports.length - a.reports.length)
    .slice(0, 3)
    .map((issue) => templateOf(issue.reports[0].id));
}

/** The bugs the board is actually about: the ones with real volume behind them. */
const HIGH_VOLUME = [...BUG_TEMPLATES]
  .sort((a, b) => b.reportCount - a.reportCount)
  .slice(0, 6);

describe("the seed corpus", () => {
  it("collapses a campaign of reports into a readable board", () => {
    const state = triageAll(REPORTS);

    expect(REPORTS.length).toBeGreaterThan(300);
    // 328 reports in, roughly twenty issues out. The exact number moves a
    // little with arrival order (see below); the collapse does not.
    expect(state.issues.length).toBeGreaterThanOrEqual(16);
    expect(state.issues.length).toBeLessThanOrEqual(24);
    expect(state.issues.length).toBeLessThan(REPORTS.length / 10);
  });

  it("does not mix two different bugs into one issue", () => {
    // The claim the product rests on. A wrongly merged report hides a real
    // bug: it disappears into someone else's issue, the occurrence count
    // lies, and nobody looks at it again.
    expect(impureIssues(triageAll(REPORTS))).toBe(0);
  });

  it("gives every high-volume bug a single dominant issue", () => {
    const counts = issueCountsByTemplate(triageAll(REPORTS));
    for (const template of HIGH_VOLUME) {
      expect(counts.get(template.key) ?? 0).toBeGreaterThanOrEqual(
        template.reportCount * 0.5,
      );
    }
  });

  it("turns noise into no issue worth reading", () => {
    const state = triageAll(REPORTS);
    expect(state.noise.length).toBeGreaterThanOrEqual(20);

    // A couple of chatty non-reports do reach the board -- two testers asking
    // about a "key" cluster as readily as two testers describing a lift. That
    // is the error worth having: it costs the studio one click, where
    // discarding a real report costs a tester their reward. What must not
    // happen is a non-report gathering enough volume to look like a bug.
    for (const issue of state.issues) {
      const noiseReports = issue.reports.filter((r) =>
        r.id.startsWith("noise-"),
      );
      if (noiseReports.length === 0) continue;
      expect(issue.reports.length).toBeLessThanOrEqual(2);
      expect(issue.severity).toBe("LOW");
    }
  });

  it("never discards a genuine report as noise", () => {
    // The expensive mistake: noise earns no reward and costs signal score,
    // so a false positive takes money and standing from someone who did the
    // work. Nine of these were being thrown away before the lexicon was
    // stemmed and the scene name was allowed to count as vocabulary.
    const discarded = triageAll(REPORTS).noise.filter(
      (r) => !r.id.startsWith("noise-") && !r.id.startsWith("repeat-"),
    );
    expect(discarded.map((r) => r.body)).toEqual([]);
  });
});

describe("order independence", () => {
  it("reaches the same board whatever order the reports arrive in", () => {
    const seedOrder = triageAll(REPORTS);
    const expectedTopThree = [...topThree(seedOrder)].sort();

    for (const seed of SHUFFLE_SEEDS) {
      const state = triageAll(shuffled(REPORTS, seed));

      // Clustering is greedy, so arrival order decides which report seeds an
      // issue and which joins one. That moves the long tail of one- and
      // two-report fragments by a few either way. It does not move the board.
      expect(
        Math.abs(state.issues.length - seedOrder.issues.length),
      ).toBeLessThanOrEqual(3);

      // The three issues a developer opens first are the same three, every
      // time. Their order among themselves can swap when two are close.
      expect([...topThree(state)].sort()).toEqual(expectedTopThree);

      // Purity is the invariant that must not bend with order.
      expect(impureIssues(state)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps every high-volume bug dominant in every order", () => {
    for (const seed of SHUFFLE_SEEDS) {
      const counts = issueCountsByTemplate(triageAll(shuffled(REPORTS, seed)));
      for (const template of HIGH_VOLUME) {
        expect(counts.get(template.key) ?? 0).toBeGreaterThanOrEqual(
          template.reportCount * 0.4,
        );
      }
    }
  });
});
