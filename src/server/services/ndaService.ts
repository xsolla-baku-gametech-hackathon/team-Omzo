import { createHash } from "node:crypto";

import {
  calculateAge,
  validateLegalName,
} from "@/domain/access/identityRules";
import { effectiveNdaBody } from "@/domain/campaigns/leakRider";
import { canPlay } from "@/domain/campaigns/windows";
import { requireSecret } from "@/server/config/secrets";
import { db } from "@/server/db";
import { isApprovedForDownload } from "@/server/services/applicationService";
import type { NdaSignature } from "@prisma/client";

export { calculateAge } from "@/domain/access/identityRules";

/**
 * NDA signing service with age gate and GDPR IP hashing (SPEC.md §4, §6.3).
 *
 * Rules:
 * - Age gate: under 18 cannot sign an NDA
 * - Privacy: never store raw IP: ipHash = sha256(ip + APP_SALT)
 * - ndaBodyHash = sha256(exact markdown signed)
 * - One signature per tester per campaign: @@unique([userId, campaignId])
 */

/**
 * The salt is the only thing standing between a stored hash and the raw
 * address: IPv4 is about four billion values, so a known salt makes the
 * whole space enumerable in seconds and the "we never store a raw IP"
 * promise meaningless. Read per call so a missing value fails closed.
 */
function ipSalt(): string {
  return requireSecret("APP_SALT");
}

export interface SignNdaInput {
  readonly userId: string;
  readonly campaignId: string;
  readonly typedName: string;
  readonly userAgent: string;
  readonly clientIp: string;
  /** Required for DOWNLOAD campaigns — redistribution acknowledgement. */
  readonly acceptedNoRedistribution?: boolean;
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

export class RedistributionAckRequiredError extends Error {
  constructor() {
    super(
      "You must acknowledge that you will not redistribute the download build.",
    );
    this.name = "RedistributionAckRequiredError";
  }
}

export class ApprovalRequiredForNdaError extends Error {
  constructor() {
    super(
      "The studio must approve your application before you can sign this NDA.",
    );
    this.name = "ApprovalRequiredForNdaError";
  }
}

/** @deprecated Prefer validateLegalName from domain/access/identityRules. */
export function isValidLegalName(name: string): {
  valid: boolean;
  reason?: string;
} {
  return validateLegalName(name);
}

export function hashIp(ip: string): string {
  return createHash("sha256")
    .update(ip.trim() + ipSalt())
    .digest("hex");
}

export function hashNdaBody(ndaBodyMd: string): string {
  return createHash("sha256").update(ndaBodyMd).digest("hex");
}

/**
 * Validates age and records an NDA signature for a campaign.
 */
export async function signNda(input: SignNdaInput): Promise<NdaSignature> {
  const typedName = input.typedName.trim();
  const nameValidation = validateLegalName(typedName);
  if (!nameValidation.valid) {
    throw new InvalidTypedNameError(nameValidation.reason);
  }

  const [campaign, user] = await Promise.all([
    db.campaign.findUnique({
      where: { id: input.campaignId },
      select: {
        id: true,
        status: true,
        revokedAt: true,
        ndaBodyMd: true,
        buildKind: true,
        applicationOpensAt: true,
        applicationClosesAt: true,
        testingStartsAt: true,
        testingEndsAt: true,
      },
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

  if (
    !canPlay({
      applicationOpensAt: campaign.applicationOpensAt,
      applicationClosesAt: campaign.applicationClosesAt,
      testingStartsAt: campaign.testingStartsAt,
      testingEndsAt: campaign.testingEndsAt,
    })
  ) {
    throw new CampaignNotOpenForSigningError(input.campaignId);
  }

  if (campaign.buildKind === "DOWNLOAD") {
    const approved = await isApprovedForDownload(
      input.campaignId,
      input.userId,
    );
    if (!approved) {
      throw new ApprovalRequiredForNdaError();
    }
    if (input.acceptedNoRedistribution !== true) {
      throw new RedistributionAckRequiredError();
    }
  }

  if (user === null || user.birthDate === null) {
    throw new MissingBirthDateError();
  }

  const age = calculateAge(user.birthDate);
  if (age < 18) {
    throw new UnderageError();
  }

  const bodyToSign = effectiveNdaBody(campaign.ndaBodyMd, campaign.buildKind);
  const ndaBodyHash = hashNdaBody(bodyToSign);
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
