/**
 * Pure password complexity and entropy rules.
 *
 * Enforces enterprise defense against credential stuffing and brute-force
 * dictionary attacks without external dependencies (pure domain logic).
 */

export interface PasswordAnalysis {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly score: number; // 0 to 100
  readonly strength: "WEAK" | "FAIR" | "STRONG" | "VERY_STRONG";
  readonly hasMinLength: boolean;
  readonly hasUppercase: boolean;
  readonly hasLowercase: boolean;
  readonly hasNumber: boolean;
  readonly hasSpecialChar: boolean;
}

const COMMON_WEAK_PASSWORDS: ReadonlySet<string> = new Set([
  "password",
  "12345678",
  "123456789",
  "qwertyuiop",
  "admin123",
  "playtest",
  "welcome1",
  "letmein1",
  "football",
  "master123",
  "iloveyou",
  "monkey123",
  "dragon12",
  "sunshine",
  "princess",
]);

export function validatePasswordStrength(password: string): PasswordAnalysis {
  const errors: string[] = [];
  const trimmed = password.trim();

  const hasMinLength = trimmed.length >= 8;
  const hasMaxLength = trimmed.length <= 128;
  const hasUppercase = /[A-Z]/.test(trimmed);
  const hasLowercase = /[a-z]/.test(trimmed);
  const hasNumber = /[0-9]/.test(trimmed);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(trimmed);

  if (!hasMinLength) {
    errors.push("Şifrə ən azı 8 simvoldan ibarət olmalıdır.");
  }
  if (!hasMaxLength) {
    errors.push("Şifrə maksimum 128 simvol ola bilər.");
  }

  const lower = trimmed.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(lower)) {
    errors.push("Bu şifrə çox sadə və geniş yayılmışdır, daha mürəkkəb kombinasiya seçin.");
  }

  // Calculate entropy score
  let poolSize = 0;
  if (hasLowercase) poolSize += 26;
  if (hasUppercase) poolSize += 26;
  if (hasNumber) poolSize += 10;
  if (hasSpecialChar) poolSize += 33;

  let score = 0;
  if (trimmed.length > 0 && poolSize > 0) {
    // Shannon-like score calculation scaled to 0-100
    const bitsOfEntropy = trimmed.length * Math.log2(poolSize);
    score = Math.min(100, Math.round((bitsOfEntropy / 64) * 100));
  }

  // Determine strength label
  let strength: PasswordAnalysis["strength"] = "WEAK";
  if (score >= 80 && hasUppercase && hasLowercase && hasNumber && hasSpecialChar) {
    strength = "VERY_STRONG";
  } else if (score >= 60 && ((hasUppercase && hasLowercase) || hasNumber)) {
    strength = "STRONG";
  } else if (score >= 35 && hasMinLength) {
    strength = "FAIR";
  } else {
    strength = "WEAK";
  }

  const isValid = hasMinLength && hasMaxLength && !COMMON_WEAK_PASSWORDS.has(lower);

  return {
    isValid,
    errors,
    score,
    strength,
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecialChar,
  };
}

export function isPasswordAcceptable(password: string): boolean {
  return validatePasswordStrength(password).isValid;
}
