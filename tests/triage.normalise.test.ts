import { describe, expect, it } from "vitest";
import { normalise, tokenise } from "@/domain/triage/normalise";

describe("normalise", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalise("  The GAME   CRASHED!!!  ")).toBe("the game crashed");
  });

  it("closes up apostrophes so contractions stay one word", () => {
    expect(normalise("I can't continue")).toBe("i cant continue");
    expect(normalise("I can’t continue")).toBe("i cant continue");
  });
});

describe("tokenise", () => {
  it("drops stopwords", () => {
    expect(tokenise("the game is on the lift")).toEqual(["game", "lift"]);
  });

  it("maps the crash family onto one token", () => {
    for (const word of ["crashed", "froze", "hung", "freezes"]) {
      expect(tokenise(`game ${word}`)).toEqual(["game", "crash"]);
    }
  });

  it("maps the performance family onto one token", () => {
    for (const word of ["fps", "lag", "stutters", "framerate"]) {
      expect(tokenise(`bad ${word}`)).toContain("performance");
    }
  });

  it("collapses phrases before stopwords can eat them", () => {
    // "stuck in" must survive as collision; stripping "in" first would leave
    // the weaker, more ambiguous "stuck".
    expect(tokenise("I got stuck in the wall")).toEqual(["collision", "wall"]);
    expect(tokenise("fell through the floor")).toEqual(["collision", "floor"]);
  });

  it("gives two wordings of the same bug a shared token", () => {
    const a = tokenise("The game froze when I used the lift");
    const b = tokenise("It hung as soon as I stepped into the lift");
    expect(a).toContain("crash");
    expect(b).toContain("crash");
    expect(a.filter((t) => b.includes(t)).sort()).toEqual(["crash", "lift"]);
  });

  it("does not pretend lift and elevator are the same word", () => {
    // They are the same thing to a player and the synonym map could be made
    // to say so -- but every synonym is a claim that merges two bugs when it
    // is wrong. Overlap here comes from state proximity instead (§5.2 B),
    // which knows both reports name the same scene and coordinates.
    expect(tokenise("the lift broke")).toContain("lift");
    expect(tokenise("the elevator broke")).toContain("elevator");
  });

  it("returns nothing for a report with no content", () => {
    expect(tokenise("...")).toEqual([]);
    expect(tokenise("it is the a")).toEqual([]);
  });
});
