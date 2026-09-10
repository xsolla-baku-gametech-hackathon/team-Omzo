import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllRateLimits,
  rateLimit,
  resetRateLimit,
} from "@/server/security/rateLimiter";

describe("rateLimiter", () => {
  beforeEach(() => {
    clearAllRateLimits();
  });

  it("allows requests within capacity", () => {
    const key = "test:user:1";
    const res1 = rateLimit(key, 5, 1);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(4);

    const res2 = rateLimit(key, 5, 1);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(3);
  });

  it("blocks requests when bucket is exhausted", () => {
    const key = "test:user:burst";
    // Consume 3 out of 3 tokens
    rateLimit(key, 3, 0.1);
    rateLimit(key, 3, 0.1);
    const res3 = rateLimit(key, 3, 0.1);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);

    // 4th request must be rejected
    const blocked = rateLimit(key, 3, 0.1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("refills tokens over time", () => {
    const key = "test:user:refill";
    const startMs = 1000000;
    // Consume 2 tokens
    rateLimit(key, 2, 1, 2, startMs);

    // Immediate next call should fail
    const blocked = rateLimit(key, 2, 1, 1, startMs);
    expect(blocked.allowed).toBe(false);

    // After 2 seconds, 2 tokens refilled
    const after2Sec = rateLimit(key, 2, 1, 1, startMs + 2000);
    expect(after2Sec.allowed).toBe(true);
    expect(after2Sec.remaining).toBe(1);
  });

  it("can reset an individual key", () => {
    const key = "test:user:reset";
    rateLimit(key, 1, 0.01);
    expect(rateLimit(key, 1, 0.01).allowed).toBe(false);

    resetRateLimit(key);
    expect(rateLimit(key, 1, 0.01).allowed).toBe(true);
  });
});
