import { describe, expect, it } from "vitest";
import {
  findClosestKeyword,
  isFuzzyMatch,
  levenshteinDistance,
  stringSimilarity,
} from "@/domain/triage/fuzzyMatch";

describe("fuzzyMatch", () => {
  it("calculates exact distance for equal strings", () => {
    expect(levenshteinDistance("collision", "collision")).toBe(0);
    expect(stringSimilarity("collision", "collision")).toBe(1.0);
  });

  it("calculates edit distance correctly for common typos", () => {
    // "cliping" -> "clipping" (1 insertion)
    expect(levenshteinDistance("cliping", "clipping")).toBe(1);

    // "colision" -> "collision" (1 insertion)
    expect(levenshteinDistance("colision", "collision")).toBe(1);

    // "invnetory" -> "inventory" (transposition = 2 edits in classical Levenshtein)
    expect(levenshteinDistance("invnetory", "inventory")).toBe(2);
  });

  it("normalizes similarity between 0 and 1", () => {
    const sim = stringSimilarity("clipping", "cliping");
    expect(sim).toBeGreaterThanOrEqual(0.85);
    expect(sim).toBeLessThan(1.0);

    const completelyDifferent = stringSimilarity("cat", "helicopter");
    expect(completelyDifferent).toBeLessThan(0.3);
  });

  it("evaluates isFuzzyMatch with default and custom threshold", () => {
    expect(isFuzzyMatch("colision", "collision", 0.8)).toBe(true);
    expect(isFuzzyMatch("respawnn", "respawn", 0.8)).toBe(true);
    expect(isFuzzyMatch("jump", "swimming", 0.8)).toBe(false);
  });

  it("finds closest keyword from a domain dictionary", () => {
    const dictionary = ["collision", "respawn", "inventory", "elevator", "shader"];

    expect(findClosestKeyword("colision", dictionary)).toBe("collision");
    expect(findClosestKeyword("elevatr", dictionary)).toBe("elevator");
    expect(findClosestKeyword("shadr", dictionary)).toBe("shader");
    expect(findClosestKeyword("unrelatedwordxyz", dictionary)).toBeNull();
  });
});
