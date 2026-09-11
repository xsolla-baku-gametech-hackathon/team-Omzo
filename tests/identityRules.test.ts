import { describe, expect, it } from "vitest";

import {
  calculateAge,
  maxBirthDateForAdult,
  parseBirthDateInput,
  validateAdultAge,
  validateContactHandle,
  validateLegalName,
  validateNameParts,
} from "@/domain/access/identityRules";

describe("identityRules", () => {
  describe("validateLegalName / validateNameParts", () => {
    it("rejects a single name", () => {
      expect(validateLegalName("Alex").valid).toBe(false);
      expect(validateNameParts("Alex", "").valid).toBe(false);
      expect(validateNameParts("", "Chen").valid).toBe(false);
    });

    it("requires first and last name of at least 2 letters", () => {
      expect(validateLegalName("A B").valid).toBe(false);
      expect(validateNameParts("Al", "C").valid).toBe(false);
      expect(validateNameParts("Alex", "Chen").valid).toBe(true);
      expect(validateLegalName("Əli Əliyev").valid).toBe(true);
    });

    it("rejects digits and symbols", () => {
      expect(validateLegalName("Alex2 Chen").valid).toBe(false);
      expect(validateLegalName("Alex Chen!").valid).toBe(false);
    });
  });

  describe("age gate", () => {
    it("computes age on birthday boundaries", () => {
      const now = new Date("2026-09-10");
      expect(calculateAge(new Date("2008-09-09"), now)).toBe(18);
      expect(calculateAge(new Date("2008-09-11"), now)).toBe(17);
    });

    it("parses YYYY-MM-DD as a local calendar date", () => {
      const parsed = parseBirthDateInput("2008-09-10");
      expect(parsed).not.toBeNull();
      expect(parsed!.getFullYear()).toBe(2008);
      expect(parsed!.getMonth()).toBe(8);
      expect(parsed!.getDate()).toBe(10);
    });

    it("rejects under-18 and missing birth dates", () => {
      const now = new Date("2026-09-11");
      expect(validateAdultAge("2010-01-01", now).valid).toBe(false);
      expect(validateAdultAge("", now).valid).toBe(false);
      expect(validateAdultAge("2000-01-01", now).valid).toBe(true);
    });

    it("exposes a max date that is exactly 18 years ago", () => {
      expect(maxBirthDateForAdult(new Date("2026-09-11"))).toBe("2008-09-11");
    });
  });

  describe("validateContactHandle", () => {
    it("requires a non-empty handle", () => {
      expect(validateContactHandle("").valid).toBe(false);
      expect(validateContactHandle("   ").valid).toBe(false);
    });

    it("accepts a plain or @-prefixed handle within range", () => {
      expect(validateContactHandle("alex_chen").valid).toBe(true);
      expect(validateContactHandle("@alex.chen99").valid).toBe(true);
    });

    it("rejects handles that are too short or too long", () => {
      expect(validateContactHandle("a").valid).toBe(false);
      expect(validateContactHandle("a".repeat(33)).valid).toBe(false);
      expect(validateContactHandle("a".repeat(32)).valid).toBe(true);
    });

    it("rejects spaces and symbols other than dot/underscore", () => {
      expect(validateContactHandle("alex chen").valid).toBe(false);
      expect(validateContactHandle("alex#1234").valid).toBe(false);
    });
  });
});
