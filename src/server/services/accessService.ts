import { createHash, randomBytes } from "node:crypto";

import { signGrantToken, verifyGrantToken } from "@/domain/access/token";
import type { GrantTokenPayload } from "@/domain/access/token";
import { db } from "@/server/db";
import type { AccessGrant, Campaign, Prisma } from "@prisma/client";

/**
 * Access Grant service (SPEC.md §4, §6.1).
 *
 * Rules:
 * - 15-minute TTL per token
 * - Single-use nonce for DOWNLOAD builds: first successful use sets consumedAt
 * - Bound to a UA hash. Mismatch rejected:
 *   "This access link belongs to another tester. Request your own from the campaign page."
 * - Re-issuance updates the existing grant row in place and keeps watermarkId for life
 * - Rate limit: max 5 issuances per rolling 1-hour window
 * - Invalid immediately if campaign.revokedAt is set or campaign.status is CLOSED
 * - Globally unique 16-bit watermarkId from sequence
 */

const ACCESS_SECRET =
  process.env.ACCESS_SECRET ??
  "fallback-dev-access-secret-at-least-32-chars-long";
const GRANT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const ROLLING_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_ISSUANCES_PER_WINDOW = 5;

export interface IssueAccessGrantInput {
  readonly userId: string;
  readonly campaignId: string;
  readonly userAgent: string;
}

export interface ValidateAccessGrantInput {
  readonly token: string;
  readonly userAgent: string;
}

export interface AccessValidationOutcome {
  readonly grant: AccessGrant;
  readonly campaign: Campaign;
  readonly payload: GrantTokenPayload;
}

export class NdaRequiredError extends Error {
  constructor() {
    super("You must review and sign the NDA before receiving access.");
    this.name = "NdaRequiredError";
  }
}

export class CampaignNotAvailableError extends Error {
  constructor(
    message: string = "This campaign is not currently open for playtesting.",
  ) {
    super(message);
    this.name = "CampaignNotAvailableError";
  }
}

export class AccessRateLimitExceededError extends Error {
  constructor() {
    super(
      "Maximum of 5 access link requests per hour reached. Please wait before requesting another.",
    );
    this.name = "AccessRateLimitExceededError";
  }
}

export class InvalidAccessTokenError extends Error {
  constructor(message: string = "Invalid or expired access token.") {
    super(message);
    this.name = "InvalidAccessTokenError";
  }
}

export class UaMismatchError extends Error {
  constructor() {
    super(
      "This access link belongs to another tester. Request your own from the campaign page.",
    );
    this.name = "UaMismatchError";
  }
}

export class AccessRevokedError extends Error {
  constructor() {
    super("This campaign has been closed or its access has been revoked.");
    this.name = "AccessRevokedError";
  }
}

export class AccessConsumedError extends Error {
  constructor() {
    super(
      "This single-use download link has already been used. Please request a fresh access link from the campaign page.",
    );
    this.name = "AccessConsumedError";
  }
}

export function hashUserAgent(userAgent: string): string {
  return createHash("sha256").update(userAgent.trim()).digest("hex");
}

export class WatermarkIdSpaceExhaustedError extends Error {
  constructor() {
    super(
      "This platform has issued all 65,535 forensic identities. Widening the watermark payload is required before further grants can be made.",
    );
    this.name = "WatermarkIdSpaceExhaustedError";
  }
}

/**
 * Allocates a globally unique 16-bit watermarkId from a Postgres sequence.
 *
 * The sequence is created by a migration rather than on demand, and there is
 * deliberately no fallback. The obvious one -- max(watermarkId) + 1 -- is a
 * race that ends with two testers sharing a forensic identity, and a decoded
 * frame then names the wrong person with full confidence. Failing to issue a
 * grant is recoverable; accusing the wrong tester is not.
 */
async function allocateWatermarkId(
  tx: Prisma.TransactionClient,
): Promise<number> {
  try {
    const rows = await tx.$queryRaw<
      { nextval: bigint | number | string }[]
    >`SELECT nextval('watermark_id_seq') AS nextval`;
    return Number(rows[0].nextval);
  } catch (error) {
    // The sequence is declared NO CYCLE, so exhaustion arrives here as an
    // error rather than as a quietly reused id.
    if (
      error instanceof Error &&
      /reached maximum value|nextval/i.test(error.message)
    ) {
      throw new WatermarkIdSpaceExhaustedError();
    }
    throw error;
  }
}

/**
 * Issues or re-issues a signed access grant for a tester on a campaign.
 */
export async function issueAccessGrant(
  input: IssueAccessGrantInput,
): Promise<{ grant: AccessGrant; token: string }> {
  const [campaign, hasSigned] = await Promise.all([
    db.campaign.findUnique({
      where: { id: input.campaignId },
      select: { id: true, status: true, revokedAt: true },
    }),
    db.ndaSignature.findUnique({
      where: {
        userId_campaignId: {
          userId: input.userId,
          campaignId: input.campaignId,
        },
      },
      select: { id: true },
    }),
  ]);

  if (
    campaign === null ||
    campaign.status !== "OPEN" ||
    campaign.revokedAt !== null
  ) {
    throw new CampaignNotAvailableError();
  }

  if (hasSigned === null) {
    throw new NdaRequiredError();
  }

  const uaHash = hashUserAgent(input.userAgent);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + GRANT_TTL_MS);
  const nonce = randomBytes(16).toString("hex");

  const grant = await db.$transaction(async (tx) => {
    const existing = await tx.accessGrant.findUnique({
      where: {
        userId_campaignId: {
          userId: input.userId,
          campaignId: input.campaignId,
        },
      },
    });

    if (existing === null) {
      const watermarkId = await allocateWatermarkId(tx);
      return tx.accessGrant.create({
        data: {
          userId: input.userId,
          campaignId: input.campaignId,
          nonce,
          watermarkId,
          uaHash,
          issuedAt: now,
          expiresAt,
          consumedAt: null,
          issuanceCount: 1,
          windowStartedAt: now,
        },
      });
    }

    // Existing grant: re-issuance in place keeping watermarkId (§6.1)
    let issuanceCount: number;
    let windowStartedAt: Date;

    if (
      now.getTime() - existing.windowStartedAt.getTime() >
      ROLLING_WINDOW_MS
    ) {
      issuanceCount = 1;
      windowStartedAt = now;
    } else {
      if (existing.issuanceCount >= MAX_ISSUANCES_PER_WINDOW) {
        throw new AccessRateLimitExceededError();
      }
      issuanceCount = existing.issuanceCount + 1;
      windowStartedAt = existing.windowStartedAt;
    }

    return tx.accessGrant.update({
      where: { id: existing.id },
      data: {
        nonce,
        uaHash,
        issuedAt: now,
        expiresAt,
        consumedAt: null, // clear consumedAt on re-issuance
        issuanceCount,
        windowStartedAt,
      },
    });
  });

  const token = signGrantToken(
    {
      grantId: grant.id,
      campaignId: grant.campaignId,
      userId: grant.userId,
      watermarkId: grant.watermarkId,
      exp: Math.floor(grant.expiresAt.getTime() / 1000),
    },
    ACCESS_SECRET,
  );

  return { grant, token };
}

/**
 * Validates an access token and user agent, checking campaign revocation and single-use nonces.
 */
export async function validateAccessGrant(
  input: ValidateAccessGrantInput,
): Promise<AccessValidationOutcome> {
  const result = verifyGrantToken(input.token, ACCESS_SECRET);
  if (!result.valid) {
    if (result.reason === "expired") {
      throw new InvalidAccessTokenError("This access token has expired.");
    }
    throw new InvalidAccessTokenError("Invalid or tampered access token.");
  }

  const payload = result.payload;

  const grant = await db.accessGrant.findUnique({
    where: { id: payload.grantId },
    include: { campaign: true },
  });

  if (grant === null) {
    throw new InvalidAccessTokenError("Access grant record not found.");
  }

  const campaign = grant.campaign;

  // Revocation check (§6.1)
  if (campaign.status === "CLOSED" || campaign.revokedAt !== null) {
    throw new AccessRevokedError();
  }

  // Expiration check
  if (grant.expiresAt.getTime() < Date.now()) {
    throw new InvalidAccessTokenError("This access grant has expired.");
  }

  // User-Agent bind check (§6.1)
  const currentUaHash = hashUserAgent(input.userAgent);
  if (grant.uaHash !== currentUaHash) {
    throw new UaMismatchError();
  }

  // Single-use check for DOWNLOAD builds
  if (campaign.buildKind === "DOWNLOAD") {
    if (grant.consumedAt !== null) {
      throw new AccessConsumedError();
    }
    // Mark consumed on first use
    await db.accessGrant.update({
      where: { id: grant.id },
      data: { consumedAt: new Date() },
    });
  }

  return { grant, campaign, payload };
}
