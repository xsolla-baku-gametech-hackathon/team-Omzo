import { describe, expect, it } from "vitest";
import { logSignature } from "@/domain/triage/signature";

describe("logSignature", () => {
  it("is empty when the console holds no errors", () => {
    expect(logSignature(["[info] loaded scene", "[debug] fps 58"])).toBe("");
    expect(logSignature([])).toBe("");
  });

  it("matches across differing ids, coordinates and timestamps", () => {
    const a = logSignature([
      "2026-03-01T10:22:31.114Z [error] Uncaught TypeError: cannot read 'mesh' of null at Lift.tick (lift.js:214)",
      "entity ckv91h2la0000qzrm3n8g1abc at 128.4, 0.0, 96.2",
    ]);
    const b = logSignature([
      "2026-03-02T18:03:07.980Z [error] Uncaught TypeError: cannot read 'mesh' of null at Lift.tick (lift.js:214)",
      "entity ckv91h2la0000qzrm3n8g9xyz at 129.1, 0.0, 95.8",
    ]);
    expect(a).not.toBe("");
    expect(a).toBe(b);
  });

  it("separates genuinely different failures", () => {
    const lift = logSignature(["[error] TypeError in Lift.tick"]);
    const audio = logSignature(["[error] RangeError in AudioMixer.flush"]);
    expect(lift).not.toBe(audio);
  });

  it("ignores the order and repetition of the same lines", () => {
    const once = logSignature([
      "[error] Failed to decode audio buffer",
      "[error] Assertion failed: mixer.channels > 0",
    ]);
    const shuffled = logSignature([
      "[error] Assertion failed: mixer.channels > 0",
      "[error] Failed to decode audio buffer",
      "[error] Failed to decode audio buffer",
    ]);
    expect(once).toBe(shuffled);
  });

  it("ignores non-error noise around the error", () => {
    const clean = logSignature(["[error] Fatal: gpu context lost"]);
    const noisy = logSignature([
      "[info] frame 41221",
      "[error] Fatal: gpu context lost",
      "[debug] retrying",
    ]);
    expect(clean).toBe(noisy);
  });
});
