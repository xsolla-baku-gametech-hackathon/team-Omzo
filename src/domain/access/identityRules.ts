/**
 * Pure identity rules shared by registration and NDA signing.
 *
 * - Full legal name: first + last (letters, hyphens, apostrophes)
 * - Age gate: must be at least 18 for NDA-capable accounts
 */

export const MIN_ADULT_AGE = 18;

export interface LegalNameResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface AgeGateResult {
  readonly valid: boolean;
  readonly age: number | null;
  readonly reason?: string;
}

/**
 * Age in whole years at `atDate` (defaults to now).
 */
export function calculateAge(
  birthDate: Date,
  atDate: Date = new Date(),
): number {
  let age = atDate.getFullYear() - birthDate.getFullYear();
  const m = atDate.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && atDate.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Parses `YYYY-MM-DD` or an ISO datetime into a Date at local midnight.
 * Returns null for empty/invalid input.
 */
export function parseBirthDateInput(value: string | undefined | null): Date | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dayOnly) {
    const year = Number(dayOnly[1]);
    const month = Number(dayOnly[2]);
    const day = Number(dayOnly[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Latest calendar date that still satisfies the adult age gate.
 */
export function maxBirthDateForAdult(
  atDate: Date = new Date(),
  minAge: number = MIN_ADULT_AGE,
): string {
  const d = new Date(
    atDate.getFullYear() - minAge,
    atDate.getMonth(),
    atDate.getDate(),
  );
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Validates a legal first + last name (Unicode letters allowed).
 */
export function validateLegalName(name: string): LegalNameResult {
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);

  if (parts.length < 2) {
    return {
      valid: false,
      reason: "Enter both your first and last name (e.g. Alex Chen).",
    };
  }
  if (parts.some((p) => p.length < 2)) {
    return {
      valid: false,
      reason: "Each part of your name must be at least 2 letters.",
    };
  }

  const validCharsRegex = /^[\p{L}][\p{L}'-.]*(?:\s+[\p{L}][\p{L}'-.]*)+$/u;
  if (!validCharsRegex.test(trimmed)) {
    return {
      valid: false,
      reason: "Names can only contain letters, hyphens, apostrophes, and spaces.",
    };
  }

  return { valid: true };
}

/**
 * Joins first + last and runs the same legal-name rules.
 */
export function validateNameParts(
  firstName: string,
  lastName: string,
): LegalNameResult {
  const first = firstName.trim();
  const last = lastName.trim();

  if (!first) {
    return { valid: false, reason: "First name is required." };
  }
  if (!last) {
    return { valid: false, reason: "Last name is required." };
  }

  return validateLegalName(`${first} ${last}`);
}

/**
 * Requires a parseable birth date and age >= minAge.
 */
export function validateAdultAge(
  birthDateInput: string | Date | undefined | null,
  atDate: Date = new Date(),
  minAge: number = MIN_ADULT_AGE,
): AgeGateResult {
  const birthDate =
    birthDateInput instanceof Date
      ? birthDateInput
      : parseBirthDateInput(
          typeof birthDateInput === "string" ? birthDateInput : null,
        );

  if (birthDate == null || Number.isNaN(birthDate.getTime())) {
    return {
      valid: false,
      age: null,
      reason: "Date of birth is required.",
    };
  }

  if (birthDate > atDate) {
    return {
      valid: false,
      age: null,
      reason: "Date of birth cannot be in the future.",
    };
  }

  const age = calculateAge(birthDate, atDate);
  if (age < minAge) {
    return {
      valid: false,
      age,
      reason: `You must be at least ${minAge} years old to create an account.`,
    };
  }

  return { valid: true, age };
}
