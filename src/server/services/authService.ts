import { compare, hash } from "bcryptjs";

import {
  validateAdultAge,
  validateContactHandle,
  validateLegalName,
} from "@/domain/access/identityRules";
import { validateIdPhoto } from "@/domain/access/idPhoto";
import { validatePasswordStrength } from "@/domain/access/passwordRules";
import { db } from "@/server/db";
import type { SessionPayload } from "@/server/session";

/**
 * Authentication service (SPEC.md §0.5, §4, §6.5).
 *
 * Rules:
 * - bcrypt cost 12
 * - Role is self-selected at register (TESTER or STUDIO)
 * - STUDIO registration creates the Studio in the same transaction
 * - birthDate required at register; must be 18+
 * - displayName must be a full legal first + last name
 */

const BCRYPT_COST = 12;

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly role: "TESTER" | "STUDIO";
  readonly birthDate: Date;
  readonly studioName?: string;
  /** Required for TESTER: a Discord or Telegram handle, so a studio can reach them. */
  readonly contactHandle?: string;
  /** Required for TESTER: a photo of ID, for age/identity verification. */
  readonly idPhoto?: Uint8Array;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export class EmailAlreadyExistsError extends Error {
  constructor(readonly email: string) {
    super("An account with this email address already exists.");
    this.name = "EmailAlreadyExistsError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
  }
}

export class WeakPasswordError extends Error {
  constructor(readonly reasons: readonly string[]) {
    super(reasons.join(" ") || "Password does not meet security requirements.");
    this.name = "WeakPasswordError";
  }
}

export class StudioNameRequiredError extends Error {
  constructor() {
    super("A studio name is required for studio accounts.");
    this.name = "StudioNameRequiredError";
  }
}

export class InvalidDisplayNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDisplayNameError";
  }
}

export class UnderageRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnderageRegistrationError";
  }
}

export class InvalidContactHandleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidContactHandleError";
  }
}

export class InvalidIdPhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidIdPhotoError";
  }
}

export async function registerUser(
  input: RegisterInput,
): Promise<SessionPayload> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();

  const existing = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existing !== null) {
    throw new EmailAlreadyExistsError(normalizedEmail);
  }

  if (input.role === "STUDIO" && !input.studioName?.trim()) {
    throw new StudioNameRequiredError();
  }

  const nameCheck = validateLegalName(displayName);
  if (!nameCheck.valid) {
    throw new InvalidDisplayNameError(
      nameCheck.reason ?? "Enter both your first and last name.",
    );
  }

  const ageCheck = validateAdultAge(input.birthDate);
  if (!ageCheck.valid) {
    throw new UnderageRegistrationError(
      ageCheck.reason ?? "You must be at least 18 years old to create an account.",
    );
  }

  const strength = validatePasswordStrength(input.password);
  if (!strength.isValid) {
    throw new WeakPasswordError(strength.errors);
  }

  let contactHandle: string | undefined;
  let idPhoto: Uint8Array<ArrayBuffer> | undefined;
  let idPhotoMimeType: string | undefined;

  if (input.role === "TESTER") {
    const handleCheck = validateContactHandle(input.contactHandle ?? "");
    if (!handleCheck.valid) {
      throw new InvalidContactHandleError(
        handleCheck.reason ?? "A Discord or Telegram handle is required.",
      );
    }
    contactHandle = (input.contactHandle ?? "").trim();

    const photoCheck = validateIdPhoto(input.idPhoto ?? new Uint8Array());
    if (!photoCheck.valid) {
      throw new InvalidIdPhotoError(
        photoCheck.reason ?? "Attach a photo of your ID.",
      );
    }
    const source = input.idPhoto ?? new Uint8Array();
    idPhoto = new Uint8Array(new ArrayBuffer(source.length));
    idPhoto.set(source);
    idPhotoMimeType = photoCheck.mimeType;
  }

  const passwordHash = await hash(input.password, BCRYPT_COST);

  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName,
        role: input.role,
        birthDate: input.birthDate,
        contactHandle,
        idPhoto,
        idPhotoMimeType,
      },
    });

    let studioId: string | undefined;

    if (input.role === "STUDIO" && input.studioName) {
      const studio = await tx.studio.create({
        data: {
          name: input.studioName.trim(),
          ownerId: user.id,
        },
      });
      studioId = studio.id;
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      studioId,
    };
  });
}

export async function loginUser(input: LoginInput): Promise<SessionPayload> {
  const normalizedEmail = input.email.trim().toLowerCase();

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
    include: { studio: { select: { id: true } } },
  });

  if (user === null) {
    throw new InvalidCredentialsError();
  }

  const matches = await compare(input.password, user.passwordHash);
  if (!matches) {
    throw new InvalidCredentialsError();
  }

  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    studioId: user.studio?.id,
  };
}
