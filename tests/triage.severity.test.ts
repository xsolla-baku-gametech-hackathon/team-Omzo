import { describe, expect, it } from "vitest";
import { categorise } from "@/domain/triage/category";
import { normalise, tokenise } from "@/domain/triage/normalise";
import { blocksProgression, severityFor } from "@/domain/triage/severity";
import { SEVERITY_THRESHOLDS } from "@/domain/triage/config";

const gameplay = (occurrenceCount: number, bodies: string[] = []) =>
  severityFor({
    category: "GAMEPLAY",
    occurrenceCount,
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
  it("treats any crash as critical however rare", () => {
    expect(
      severityFor({
        category: "CRASH",
        occurrenceCount: 1,
        normalisedBodies: [],
      }),
    ).toBe("CRITICAL");
  });

  it("escalates as occurrences accumulate", () => {
    expect(gameplay(1)).toBe("LOW");
    expect(gameplay(2)).toBe("LOW");
    expect(gameplay(SEVERITY_THRESHOLDS.medium)).toBe("MEDIUM");
    expect(gameplay(SEVERITY_THRESHOLDS.high - 1)).toBe("MEDIUM");
    expect(gameplay(SEVERITY_THRESHOLDS.high)).toBe("HIGH");
    expect(gameplay(SEVERITY_THRESHOLDS.critical - 1)).toBe("HIGH");
    expect(gameplay(SEVERITY_THRESHOLDS.critical)).toBe("CRITICAL");
  });

  it("escalates a progression blocker without waiting for volume", () => {
    expect(gameplay(1, ["I can't continue, stuck behind the gate"])).toBe(
      "HIGH",
    );
    expect(gameplay(1, ["softlock at the second checkpoint"])).toBe("HIGH");
  });

  it("needs only one occurrence to report the blocker", () => {
    expect(gameplay(2, ["minor thing", "had to restart the whole run"])).toBe(
      "HIGH",
    );
  });
});

describe("blocksProgression", () => {
  it("matches contractions the way normalise leaves them", () => {
    expect(blocksProgression(normalise("I can't continue"))).toBe(true);
    expect(blocksProgression(normalise("I can’t continue"))).toBe(true);
    expect(blocksProgression(normalise("the texture is odd"))).toBe(false);
  });
});
