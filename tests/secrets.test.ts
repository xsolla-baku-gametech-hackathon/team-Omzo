import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  InsecureSecretError,
  MIN_SECRET_LENGTH,
  isRelaxedEnvironment,
  requireSecret,
  requireSecretBytes,
  resetSecretWarningsForTests,
} from "@/server/config/secrets";

const STRONG = "a".repeat(MIN_SECRET_LENGTH);

describe("secret loading", () => {
  beforeEach(() => {
    resetSecretWarningsForTests();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("outside development", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    it("refuses to hand out a key when the variable is unset", () => {
      vi.stubEnv("SESSION_SECRET", "");
      expect(() => requireSecret("SESSION_SECRET")).toThrow(
        InsecureSecretError,
      );
    });

    it("treats an empty string as unset", () => {
      // The exact shape .env.example ships. `??` let this through as a real
      // value, which meant signing with an empty key.
      vi.stubEnv("SESSION_SECRET", "");
      expect(() => requireSecret("SESSION_SECRET")).toThrow(
        InsecureSecretError,
      );
    });

    it("treats whitespace as unset", () => {
      vi.stubEnv("ACCESS_SECRET", "   \n\t ");
      expect(() => requireSecret("ACCESS_SECRET")).toThrow(InsecureSecretError);
    });

    it("rejects a key below the minimum length", () => {
      vi.stubEnv("APP_SALT", "a".repeat(MIN_SECRET_LENGTH - 1));
      expect(() => requireSecret("APP_SALT")).toThrow(InsecureSecretError);
    });

    it("accepts a key at the minimum length", () => {
      vi.stubEnv("SESSION_SECRET", STRONG);
      expect(requireSecret("SESSION_SECRET")).toBe(STRONG);
    });

    it("never falls back to a committed default", () => {
      // The regression that matters: a fallback in the repository is public,
      // so a forgotten env var would mean anyone can forge a session.
      vi.stubEnv("SESSION_SECRET", "");
      let caught: unknown;
      try {
        requireSecret("SESSION_SECRET");
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(InsecureSecretError);
      expect((caught as Error).message).not.toContain("insecure-development");
    });

    it("does not leak the secret value in the error message", () => {
      vi.stubEnv("SESSION_SECRET", "short-but-secret");
      let message = "";
      try {
        requireSecret("SESSION_SECRET");
      } catch (error) {
        message = (error as Error).message;
      }
      // The value is weak, but it is still a secret: it must not end up in a
      // log line or a stack trace.
      expect(message).not.toContain("short-but-secret");
      expect(message).toContain("SESSION_SECRET");
    });
  });

  describe("in development", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    it("falls back so the app still runs, and says so once", () => {
      vi.stubEnv("SESSION_SECRET", "");
      const value = requireSecret("SESSION_SECRET");

      expect(value.length).toBeGreaterThanOrEqual(MIN_SECRET_LENGTH);
      expect(value).toContain("insecure-development-only");
      expect(console.warn).toHaveBeenCalledTimes(1);

      requireSecret("SESSION_SECRET");
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it("gives each secret a distinct fallback", () => {
      vi.stubEnv("SESSION_SECRET", "");
      vi.stubEnv("ACCESS_SECRET", "");
      vi.stubEnv("APP_SALT", "");

      const values = new Set([
        requireSecret("SESSION_SECRET"),
        requireSecret("ACCESS_SECRET"),
        requireSecret("APP_SALT"),
      ]);
      // Distinct, so a bug that reads the wrong secret fails to verify rather
      // than quietly succeeding.
      expect(values.size).toBe(3);
    });

    it("still prefers a real value when one is set", () => {
      vi.stubEnv("ACCESS_SECRET", STRONG);
      expect(requireSecret("ACCESS_SECRET")).toBe(STRONG);
    });
  });

  describe("environment classification", () => {
    it("treats only development and test as relaxed", () => {
      expect(isRelaxedEnvironment("development")).toBe(true);
      expect(isRelaxedEnvironment("test")).toBe(true);
      expect(isRelaxedEnvironment("production")).toBe(false);
      expect(isRelaxedEnvironment("staging")).toBe(false);
    });

    it("treats an unset NODE_ENV as production", () => {
      // A deploy that forgets NODE_ENV should fail closed, not pick up a
      // development key.
      expect(isRelaxedEnvironment(undefined)).toBe(false);
    });
  });

  it("encodes bytes matching the string form", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", STRONG);

    expect(requireSecretBytes("SESSION_SECRET")).toEqual(
      new TextEncoder().encode(STRONG),
    );
  });
});
