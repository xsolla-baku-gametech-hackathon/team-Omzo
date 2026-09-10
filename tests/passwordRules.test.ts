import { describe, expect, it } from "vitest";
import { isPasswordAcceptable, validatePasswordStrength } from "@/domain/access/passwordRules";

describe("passwordRules", () => {
  it("rejects passwords shorter than 8 characters", () => {
    const res = validatePasswordStrength("short1!");
    expect(res.isValid).toBe(false);
    expect(res.hasMinLength).toBe(false);
    expect(res.errors).toContain("Şifrə ən azı 8 simvoldan ibarət olmalıdır.");
  });

  it("rejects common dictionary passwords", () => {
    const res = validatePasswordStrength("password");
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain("Bu şifrə çox sadə və geniş yayılmışdır, daha mürəkkəb kombinasiya seçin.");
  });

  it("accepts a strong mixed-case password with symbols", () => {
    const res = validatePasswordStrength("Secure#Dev2026!");
    expect(res.isValid).toBe(true);
    expect(res.hasMinLength).toBe(true);
    expect(res.hasUppercase).toBe(true);
    expect(res.hasLowercase).toBe(true);
    expect(res.hasNumber).toBe(true);
    expect(res.hasSpecialChar).toBe(true);
    expect(res.strength).toBe("VERY_STRONG");
    expect(res.score).toBeGreaterThanOrEqual(80);
  });

  it("scores fair for basic length passwords", () => {
    const res = validatePasswordStrength("abcdefgh");
    expect(res.isValid).toBe(true);
    expect(res.hasMinLength).toBe(true);
    expect(res.strength).toBe("FAIR");
  });

  it("isPasswordAcceptable helper function matches isValid", () => {
    expect(isPasswordAcceptable("12345")).toBe(false);
    expect(isPasswordAcceptable("12345678")).toBe(false); // common
    expect(isPasswordAcceptable("UniquePass!2026")).toBe(true);
  });
});
