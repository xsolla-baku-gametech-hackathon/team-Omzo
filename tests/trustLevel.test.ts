import { describe, expect, it } from "vitest";

import { trustLevelOf, trustTierOf } from "@/domain/trust/level";

describe("trustLevelOf", () => {
  it("maps neutral signal 100 to level 50", () => {
    expect(trustLevelOf(100)).toBe(50);
  });

  it("clamps to 1–100", () => {
    expect(trustLevelOf(0)).toBe(1);
    expect(trustLevelOf(200)).toBe(100);
    expect(trustLevelOf(-10)).toBe(1);
    expect(trustLevelOf(999)).toBe(100);
  });

  it("assigns tiers", () => {
    expect(trustTierOf(1)).toBe("New");
    expect(trustTierOf(33)).toBe("New");
    expect(trustTierOf(34)).toBe("Proven");
    expect(trustTierOf(66)).toBe("Proven");
    expect(trustTierOf(67)).toBe("Veteran");
    expect(trustTierOf(100)).toBe("Veteran");
  });
});
