import { describe, expect, it } from "vitest";
import { describeSharedTraits } from "@/domain/triage/describe";
import type { TraitObservation } from "@/domain/triage/describe";

const observation = (
  overrides: {
    gpu?: string;
    browser?: string;
    os?: string;
    scene?: string;
    x?: number;
    z?: number;
  } = {},
): TraitObservation => ({
  systemInfo: {
    os: overrides.os ?? "Windows 11",
    browser: overrides.browser ?? "Chrome 131",
    gpuRenderer: overrides.gpu ?? "AMD Radeon RX 6800",
    screen: "2560x1440",
  },
  gameState: {
    scene: overrides.scene ?? "atrium",
    x: overrides.x ?? 128,
    y: 0,
    z: overrides.z ?? 96,
    playtimeSec: 300,
  },
});

const many = (count: number, overrides = {}) =>
  Array.from({ length: count }, () => observation(overrides));

describe("describeSharedTraits", () => {
  it("states a hardware pattern a developer can act on", () => {
    const traits = describeSharedTraits([
      ...many(16, { gpu: "AMD Radeon RX 6800" }),
      ...many(2, { gpu: "NVIDIA GeForce RTX 3070" }),
    ]);

    expect(traits.sentence).toContain("16 of 18 occurrences on AMD GPUs");
    expect(traits.gpu).toEqual({ name: "AMD", count: 16 });
  });

  it("locates the issue in the world", () => {
    const traits = describeSharedTraits([
      observation({ x: 128, z: 96 }),
      observation({ x: 130, z: 98 }),
      observation({ x: 126, z: 94 }),
    ]);

    expect(traits.sentence).toContain("All within");
    expect(traits.sentence).toContain("in atrium");
    expect(traits.scene).toBe("atrium");
  });

  it("stays quiet about a trait that is not actually shared", () => {
    // Half on one vendor is not a pattern, it is market share. Saying "9 of
    // 18 on AMD" would send a developer hunting a driver bug that isn't there.
    const traits = describeSharedTraits([
      ...many(9, { gpu: "AMD Radeon RX 6800" }),
      ...many(9, { gpu: "NVIDIA GeForce RTX 3070" }),
    ]);

    expect(traits.sentence).not.toContain("AMD");
    expect(traits.sentence).not.toContain("NVIDIA");
  });

  it("says plainly when nothing is shared", () => {
    const traits = describeSharedTraits([
      observation({
        gpu: "AMD Radeon RX 6800",
        browser: "Chrome 131",
        os: "Windows 11",
        scene: "",
      }),
      observation({
        gpu: "NVIDIA GeForce RTX 3070",
        browser: "Firefox 133",
        os: "Ubuntu 22.04",
        scene: "",
      }),
      observation({
        gpu: "Apple M3",
        browser: "Safari 17",
        os: "macOS 15.1",
        scene: "",
      }),
    ]);

    // Useful in itself: no shared pattern points away from a hardware bug.
    expect(traits.sentence).toContain("no shared hardware or location pattern");
  });

  it("classifies Edge as Edge, not as Chrome", () => {
    // Edge and Opera both carry "Chrome" in their user agent. The server used
    // to do its own classification and tested for Chrome first, so this is
    // the case where a second implementation silently disagreed with the one
    // the clusterer uses.
    const traits = describeSharedTraits(
      many(10, { browser: "Edge 131 Chrome/131" }),
    );
    expect(traits.browser?.name).toBe("Edge");
  });

  it("handles an issue with no occurrences without inventing one", () => {
    expect(describeSharedTraits([]).sentence).toBe(
      "No occurrences recorded yet.",
    );
    expect(describeSharedTraits([]).total).toBe(0);
  });
});

describe("sentence shape", () => {
  it("starts every clause with a capital", () => {
    const traits = describeSharedTraits([
      ...many(9, { gpu: "AMD Radeon RX 6800", browser: "Chrome 131" }),
      observation({ gpu: "AMD Radeon RX 6800", browser: "Chrome 131" }),
    ]);

    for (const clause of traits.sentence.replace(/\.$/, "").split(". ")) {
      expect(clause[0]).toBe(clause[0].toUpperCase());
    }
  });
});
