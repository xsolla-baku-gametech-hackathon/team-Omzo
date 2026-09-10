import { describe, expect, it } from "vitest";
import { categorise } from "@/domain/triage/category";
import { normalise, tokenise } from "@/domain/triage/normalise";
import { blocksProgression, severityFor } from "@/domain/triage/severity";
import { SEVERITY_MIN_CAMPAIGN, SEVERITY_SHARES } from "@/domain/triage/config";

const CAMPAIGN = 400;

/** A non-crash, non-blocking issue of a given size in a 400-report campaign. */
const cosmetic = (occurrenceCount: number, bodies: string[] = []) =>
  severityFor({
    category: "UX",
    occurrenceCount,
    campaignReportCount: CAMPAIGN,
    normalisedBodies: bodies.map(normalise),
  });

const gameplay = (
  occurrenceCount: number,
  bodies: string[] = [],
  campaignReportCount = CAMPAIGN,
) =>
  severityFor({
    category: "GAMEPLAY",
    occurrenceCount,
    campaignReportCount,
    normalisedBodies: bodies.map(normalise),
  });

describe("categorise", () => {
  it("puts a crash above everything else it also matches", () => {
    expect(
      categorise(tokenise("the game froze and the textures flickered")),
    ).toBe("CRASH");
  });

  it("reads the obvious categories", () => {
    expect(categorise(tokenise("fps tanks near the spawn"))).toBe(
      "PERFORMANCE",
    );
    expect(categorise(tokenise("no sound in the lift"))).toBe("AUDIO");
    expect(categorise(tokenise("textures flicker on the bridge"))).toBe(
      "VISUAL",
    );
    expect(categorise(tokenise("the inventory button does nothing"))).toBe(
      "UX",
    );
  });

  it("falls back to gameplay rather than guessing", () => {
    expect(categorise(tokenise("the door near the lift never opens"))).toBe(
      "GAMEPLAY",
    );
  });
});

describe("severityFor", () => {
  it("treats a lone crash as critical", () => {
    // One crash ends one session. Impact does not need a crowd to confirm it.
    expect(
      severityFor({
        category: "CRASH",
        occurrenceCount: 1,
        campaignReportCount: CAMPAIGN,
        normalisedBodies: [],
      }),
    ).toBe("CRITICAL");
  });

  it("never makes a cosmetic issue critical on volume alone", () => {
    // 200 reports in a 4000-report campaign is a 5% share: widespread, and
    // still cosmetic. Frequency says how far an impact reaches, not whether
    // there is one.
    expect(
      severityFor({
        category: "UX",
        occurrenceCount: 200,
        campaignReportCount: 4000,
        normalisedBodies: [],
      }),
    ).toBe("MEDIUM");
  });

  it("escalates as occurrences accumulate", () => {
    expect(cosmetic(1)).toBe("LOW");
    expect(cosmetic(3)).toBe("LOW");
    expect(cosmetic(CAMPAIGN * SEVERITY_SHARES.medium)).toBe("MEDIUM");
    expect(cosmetic(CAMPAIGN * SEVERITY_SHARES.high)).toBe("HIGH");
    expect(cosmetic(CAMPAIGN * SEVERITY_SHARES.critical)).toBe("CRITICAL");
  });

  it("escalates a progression blocker on a far smaller share", () => {
    const blocker = ["I can't continue, stuck behind the gate"];
    const justBlocking = CAMPAIGN * SEVERITY_SHARES.criticalBlocking;

    expect(gameplay(1, blocker)).toBe("HIGH");
    expect(gameplay(justBlocking, blocker)).toBe("CRITICAL");
    // The same reach without a blocker is only MEDIUM.
    expect(gameplay(justBlocking)).toBe("MEDIUM");
  });

  it("does not open a fresh campaign's first issue at critical", () => {
    // Without the floor the first report of a campaign is 100% of it, so
    // every new issue would open CRITICAL and a studio's first morning of
    // testing would be nothing but red.
    expect(gameplay(1, [], 1)).toBe("MEDIUM");
    expect(gameplay(2, [], 2)).toBe("MEDIUM");

    // The floor is the denominator until the campaign outgrows it, so a
    // count below it means the same thing however few reports have arrived.
    expect(gameplay(8, [], 8)).toBe(gameplay(8, [], SEVERITY_MIN_CAMPAIGN));

    // Past the floor the real denominator takes over and the same count
    // becomes a larger share.
    expect(gameplay(8, [], 800)).toBe("LOW");
    expect(gameplay(8, [], 400)).toBe("MEDIUM");
    expect(gameplay(8, [], 100)).toBe("HIGH");
    expect(gameplay(8, [], 60)).toBe("CRITICAL");
  });

  it("recomputes from the combined count when issues merge", () => {
    // Two issues of 25 in a 400-report campaign are MEDIUM apart (6.25%)
    // and CRITICAL together (12.5%). Severity has to be recomputed from the
    // combined count on merge, not carried over from either side.
    expect(cosmetic(25)).toBe("MEDIUM");
    expect(cosmetic(50)).toBe("CRITICAL");
  });
});

describe("blocksProgression", () => {
  it("matches contractions the way normalise leaves them", () => {
    expect(blocksProgression(normalise("I can't continue"))).toBe(true);
    expect(blocksProgression(normalise("I can’t continue"))).toBe(true);
    expect(blocksProgression(normalise("the texture is odd"))).toBe(false);
  });
});
