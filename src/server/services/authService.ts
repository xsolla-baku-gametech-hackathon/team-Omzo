import { compare, hash } from "bcryptjs";

import { db } from "@/server/db";
import type { SessionPayload } from "@/server/session";

/**
 * Authentication service (SPEC.md §0.5, §4, §6.5).
 *
 * Rules:
 * - bcrypt cost 12
 * - Role is self-selected at register (TESTER or STUDIO)
 * - STUDIO registration creates the Studio in the same transaction
 * - birthDate collected at register
 */

const BCRYPT_COST = 12;

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly role: "TESTER" | "STUDIO";
  readonly birthDate?: Date;
  readonly studioName?: string;
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

export class StudioNameRequiredError extends Error {
  constructor() {
    super("A studio name is required for studio accounts.");
    this.name = "StudioNameRequiredError";
  }
}

export async function registerUser(
  input: RegisterInput,
): Promise<SessionPayload> {
  const normalizedEmail = input.email.trim().toLowerCase();

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

  const passwordHash = await hash(input.password, BCRYPT_COST);

  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName: input.displayName.trim(),
        role: input.role,
        birthDate: input.birthDate ?? null,
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
