import { createHash } from "node:crypto";

import { db } from "@/server/db";
import type { NdaSignature } from "@prisma/client";

/**
 * NDA signing service with age gate and GDPR IP hashing (SPEC.md §4, §6.3).
 *
 * Rules:
 * - Age gate: under 18 cannot sign an NDA
 * - Privacy: never store raw IP: ipHash = sha256(ip + APP_SALT)
 * - ndaBodyHash = sha256(exact markdown signed)
 * - One signature per tester per campaign: @@unique([userId, campaignId])
 */

const APP_SALT = process.env.APP_SALT ?? "dev-fallback-salt-do-not-use-in-prod";

export interface SignNdaInput {
  readonly userId: string;
  readonly campaignId: string;
  readonly typedName: string;
  readonly userAgent: string;
  readonly clientIp: string;
}

export class UnderageError extends Error {
  constructor() {
    super(
      "You must be at least 18 years old to sign an NDA and participate in playtests.",
    );
    this.name = "UnderageError";
  }
}

export class MissingBirthDateError extends Error {
  constructor() {
    super(
      "A verified date of birth is required on your account before signing an NDA.",
    );
    this.name = "MissingBirthDateError";
  }
}

export class CampaignNotOpenForSigningError extends Error {
  constructor(campaignId: string) {
    super(`Campaign ${campaignId} is not accepting NDA signatures.`);
    this.name = "CampaignNotOpenForSigningError";
  }
}

export class InvalidTypedNameError extends Error {
  constructor(
    message: string = "You must type your full legal name (first and last name) to sign the NDA.",
  ) {
    super(message);
    this.name = "InvalidTypedNameError";
  }
}

/**
 * Validates that a string contains a legitimate legal first and last name.
 * Requires at least 2 words, each at least 2 chars, letters/hyphens/apostrophes only.
 */
export function isValidLegalName(name: string): { valid: boolean; reason?: string } {
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) {
    return {
      valid: false,
      reason: "Həm ad, həm də soyad daxil edilməlidir (məsələn: Əli Əliyev və ya John Doe).",
    };
  }
  if (parts.some((p) => p.length < 2)) {
    return {
      valid: false,
      reason: "Ad və soyadın hər biri ən azı 2 hərfdən ibarət olmalıdır.",
    };
  }
  // Unicode letters, hyphens, apostrophes, spaces, periods. Reject numbers and symbols.
  const validCharsRegex = /^[\p{L}][\p{L}'-.]*(?:\s+[\p{L}][\p{L}'-.]*)+$/u;
  if (!validCharsRegex.test(trimmed)) {
    return {
      valid: false,
      reason: "Ad və soyadda rəqəm və ya xüsusi simvollar ola bilməz.",
    };
  }
  return { valid: true };
}

export function hashIp(ip: string): string {
  return createHash("sha256")
    .update(ip.trim() + APP_SALT)
    .digest("hex");
}

export function hashNdaBody(ndaBodyMd: string): string {
  return createHash("sha256").update(ndaBodyMd).digest("hex");
}

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
 * Validates age and records an NDA signature for a campaign.
 */
export async function signNda(input: SignNdaInput): Promise<NdaSignature> {
  const typedName = input.typedName.trim();
  const nameValidation = isValidLegalName(typedName);
  if (!nameValidation.valid) {
    throw new InvalidTypedNameError(nameValidation.reason);
  }

  const [campaign, user] = await Promise.all([
    db.campaign.findUnique({
      where: { id: input.campaignId },
      select: { id: true, status: true, revokedAt: true, ndaBodyMd: true },
    }),
    db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, birthDate: true },
    }),
  ]);

  if (
    campaign === null ||
    campaign.status !== "OPEN" ||
    campaign.revokedAt !== null
  ) {
    throw new CampaignNotOpenForSigningError(input.campaignId);
  }

  if (user === null || user.birthDate === null) {
    throw new MissingBirthDateError();
  }

  const age = calculateAge(user.birthDate);
  if (age < 18) {
    throw new UnderageError();
  }

  const ndaBodyHash = hashNdaBody(campaign.ndaBodyMd);
  const ipHash = hashIp(input.clientIp);

  return db.ndaSignature.upsert({
    where: {
      userId_campaignId: {
        userId: input.userId,
        campaignId: input.campaignId,
      },
    },
    update: {
      typedName,
      ndaBodyHash,
      ipHash,
      userAgent: input.userAgent,
      signedAt: new Date(),
    },
    create: {
      userId: input.userId,
      campaignId: input.campaignId,
      typedName,
      ndaBodyHash,
      ipHash,
      userAgent: input.userAgent,
    },
  });
}

/**
 * Checks if a user has signed the NDA for a campaign.
 */
export async function hasSignedNda(
  userId: string,
  campaignId: string,
): Promise<boolean> {
  const record = await db.ndaSignature.findUnique({
    where: {
      userId_campaignId: { userId, campaignId },
    },
    select: { id: true },
  });
  return record !== null;
}

/**
 * Gets a user's NDA signature for a campaign.
 */
export async function getNdaSignature(
  userId: string,
  campaignId: string,
): Promise<NdaSignature | null> {
  return db.ndaSignature.findUnique({
    where: {
      userId_campaignId: { userId, campaignId },
    },
  });
}

/**
 * Gets all NDA signatures signed by a user (for /me page).
 */
export async function getUserNdaSignatures(
  userId: string,
): Promise<readonly (NdaSignature & { campaign: { title: string } })[]> {
  return db.ndaSignature.findMany({
    where: { userId },
    include: {
      campaign: {
        select: { title: true },
      },
    },
    orderBy: { signedAt: "desc" },
  });
}
