import { describe, expect, it } from "vitest";
import {
  detectGameEngine,
  normalizeStackLine,
  parseStackTrace,
} from "@/domain/triage/stackTrace";

describe("stackTrace domain normalizer", () => {
  it("detects Unity game engine traces", () => {
    const trace = `UnityLoader.js: Unity error occurred in il2cpp: NullReferenceException`;
    expect(detectGameEngine(trace)).toBe("UNITY");
  });

  it("detects Unreal game engine traces", () => {
    const trace = `Assertion failed: FEngineLoop::Tick() at 0x7ffee98273`;
    expect(detectGameEngine(trace)).toBe("UNREAL");
  });

  it("normalizes hex addresses and high numeric offsets", () => {
    const line = "at PlayerController.Update (0x7ffee98273:149202)";
    const normalized = normalizeStackLine(line);
    expect(normalized).toBe("at PlayerController.Update (<ADDR>:<NUM>)");
  });

  it("parses multiline callstack and extracts top frame", () => {
    const multiline = `TypeError: Cannot read properties of undefined
      at LiftController.move (assets/scripts/lift.js:42:15)
      at SceneManager.tick (assets/scripts/scene.js:100:5)`;

    const crash = parseStackTrace(multiline);
    expect(crash.engine).toBe("BROWSER");
    expect(crash.topFrame?.functionName).toBe("LiftController.move");
    expect(crash.topFrame?.fileName).toBe("lift.js");
    expect(crash.topFrame?.lineNumber).toBe(42);
    expect(crash.framesCount).toBe(3);
    expect(crash.signature).toContain("BROWSER:");
  });

  it("handles empty or malformed trace gracefully", () => {
    const crash = parseStackTrace("");
    expect(crash.engine).toBe("UNKNOWN");
    expect(crash.signature).toBe("EMPTY_TRACE");
    expect(crash.framesCount).toBe(0);
  });
});
