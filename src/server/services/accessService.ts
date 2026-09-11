import { createHash, randomBytes } from "node:crypto";

import { signGrantToken, verifyGrantToken } from "@/domain/access/token";
import type { GrantTokenPayload } from "@/domain/access/token";
import { canPlay } from "@/domain/campaigns/windows";
import { requireSecret } from "@/server/config/secrets";
import { db } from "@/server/db";
import { isApprovedForDownload } from "@/server/services/applicationService";
import type {
  AccessGrant,
  AccessOutcome,
  BuildKind,
  Campaign,
  Prisma,
} from "@prisma/client";

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

/**
 * Read per call, not at module load: a throw at import time would break
 * `next build`, which evaluates modules without the deploy's environment.
 * A forgeable ACCESS_SECRET means minting build grants for any campaign and
 * pinning the resulting watermark on an arbitrary tester, so this must never
 * fall back to a committed value.
 */
function accessSecret(): string {
  return requireSecret("ACCESS_SECRET");
}

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
  /**
   * Whether this validation is the single use a DOWNLOAD grant is allowed.
   *
   * Off by default, because checking a token in order to render a page is not
   * using the link. Only the route that actually hands over the build passes
   * this — otherwise loading the session surface would burn the download
   * before the tester clicked anything.
   *
   * An already-consumed grant is refused either way; this gates the write,
   * not the check.
   */
  readonly consume?: boolean;
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

/**
 * What a refusal knows about itself.
 *
 * A denial is the most interesting thing the access log records — repeated
 * UA mismatches against one grant is a link being passed around — but the
 * log needs a campaign to file it under. Carrying the context on the error
 * means the caller records it without re-verifying the token to find out who
 * was turned away.
 *
 * null when the token did not parse at all, which is the one case where
 * there is genuinely nothing to attribute.
 */
export interface AccessDenialContext {
  readonly campaignId: string;
  readonly userId: string | null;
  readonly grantId: string | null;
  readonly buildKind: BuildKind;
}

/**
 * Base for every refusal, so a caller can log one without knowing which.
 *
 * Each subclass names the outcome it records. Deriving that from the message
 * text at the call site would make an audit trail depend on wording that
 * exists to be read by a tester.
 */
export class AccessDeniedError extends Error {
  context: AccessDenialContext | null = null;
  readonly outcome: AccessOutcome = "DENIED_INVALID_TOKEN";
}

export class InvalidAccessTokenError extends AccessDeniedError {
  override readonly outcome: AccessOutcome;

  constructor(
    message: string = "Invalid or expired access token.",
    outcome: AccessOutcome = "DENIED_INVALID_TOKEN",
  ) {
    super(message);
    this.name = "InvalidAccessTokenError";
    this.outcome = outcome;
  }
}

export class UaMismatchError extends AccessDeniedError {
  override readonly outcome: AccessOutcome = "DENIED_UA_MISMATCH";

  constructor() {
    super(
      "This access link belongs to another tester. Request your own from the campaign page.",
    );
    this.name = "UaMismatchError";
  }
}

export class AccessRevokedError extends AccessDeniedError {
  override readonly outcome: AccessOutcome = "DENIED_REVOKED";

  constructor() {
    super("This campaign has been closed or its access has been revoked.");
    this.name = "AccessRevokedError";
  }
}

export class AccessConsumedError extends AccessDeniedError {
  override readonly outcome: AccessOutcome = "DENIED_CONSUMED";

  constructor() {
    super(
      "This single-use download link has already been used. Please request a fresh access link from the campaign page.",
    );
    this.name = "AccessConsumedError";
  }
}

export class AccessOutsideWindowError extends AccessDeniedError {
  override readonly outcome: AccessOutcome = "DENIED_OUTSIDE_WINDOW";
  constructor() {
    super("This campaign's testing window is closed.");
    this.name = "AccessOutsideWindowError";
  }
}

export class AccessNotApprovedError extends AccessDeniedError {
  override readonly outcome: AccessOutcome = "DENIED_NOT_APPROVED";
  constructor() {
    super(
      "You must be approved by the studio before accessing this download build.",
    );
    this.name = "AccessNotApprovedError";
  }
}

export class ApplicationRequiredError extends Error {
  constructor() {
    super(
      "This download campaign requires studio approval before you can receive access.",
    );
    this.name = "ApplicationRequiredError";
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
      select: {
        id: true,
        status: true,
        revokedAt: true,
        buildKind: true,
        applicationOpensAt: true,
        applicationClosesAt: true,
        testingStartsAt: true,
        testingEndsAt: true,
      },
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

  if (
    !canPlay({
      applicationOpensAt: campaign.applicationOpensAt,
      applicationClosesAt: campaign.applicationClosesAt,
      testingStartsAt: campaign.testingStartsAt,
      testingEndsAt: campaign.testingEndsAt,
    })
  ) {
    throw new CampaignNotAvailableError(
      "This campaign's testing window is not open.",
    );
  }

  if (campaign.buildKind === "DOWNLOAD") {
    const approved = await isApprovedForDownload(
      input.campaignId,
      input.userId,
    );
    if (!approved) {
      throw new ApplicationRequiredError();
    }
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
    accessSecret(),
  );

  return { grant, token };
}

/** Attaches the context to a refusal and hands it back for throwing. */
function denied<E extends AccessDeniedError>(
  error: E,
  context: AccessDenialContext | null,
): E {
  error.context = context;
  return error;
}

/**
 * Validates an access token and user agent, checking campaign revocation and single-use nonces.
 */
export async function validateAccessGrant(
  input: ValidateAccessGrantInput,
): Promise<AccessValidationOutcome> {
  const result = verifyGrantToken(input.token, accessSecret());
  if (!result.valid) {
    // Nothing parsed, so there is nobody and no campaign to attribute the
    // refusal to. The context stays null rather than being guessed.
    if (result.reason === "expired") {
      throw new InvalidAccessTokenError(
        "This access token has expired.",
        "DENIED_EXPIRED",
      );
    }
    throw new InvalidAccessTokenError("Invalid or tampered access token.");
  }

  const payload = result.payload;

  const grant = await db.accessGrant.findUnique({
    where: { id: payload.grantId },
    include: { campaign: true },
  });

  if (grant === null) {
    // A validly signed token naming a grant row that is gone. Rare enough to
    // afford one extra read so the refusal is still filed against a campaign.
    const campaign = await db.campaign.findUnique({
      where: { id: payload.campaignId },
      select: { buildKind: true },
    });
    throw denied(
      new InvalidAccessTokenError("Access grant record not found."),
      campaign === null
        ? null
        : {
            campaignId: payload.campaignId,
            userId: payload.userId,
            grantId: payload.grantId,
            buildKind: campaign.buildKind,
          },
    );
  }

  const campaign = grant.campaign;

  const context: AccessDenialContext = {
    campaignId: campaign.id,
    userId: grant.userId,
    grantId: grant.id,
    buildKind: campaign.buildKind,
  };

  // Revocation check (§6.1)
  if (campaign.status === "CLOSED" || campaign.revokedAt !== null) {
    throw denied(new AccessRevokedError(), context);
  }

  if (
    !canPlay({
      applicationOpensAt: campaign.applicationOpensAt,
      applicationClosesAt: campaign.applicationClosesAt,
      testingStartsAt: campaign.testingStartsAt,
      testingEndsAt: campaign.testingEndsAt,
    })
  ) {
    throw denied(new AccessOutsideWindowError(), context);
  }

  if (campaign.buildKind === "DOWNLOAD") {
    const approved = await isApprovedForDownload(campaign.id, grant.userId);
    if (!approved) {
      throw denied(new AccessNotApprovedError(), context);
    }
  }

  // Expiration check
  if (grant.expiresAt.getTime() < Date.now()) {
    throw denied(
      new InvalidAccessTokenError(
        "This access grant has expired.",
        "DENIED_EXPIRED",
      ),
      context,
    );
  }

  // User-Agent bind check (§6.1)
  const currentUaHash = hashUserAgent(input.userAgent);
  if (grant.uaHash !== currentUaHash) {
    throw denied(new UaMismatchError(), context);
  }

  // Single-use check for DOWNLOAD builds
  if (campaign.buildKind === "DOWNLOAD") {
    if (grant.consumedAt !== null) {
      throw denied(new AccessConsumedError(), context);
    }
    if (input.consume === true) {
      await db.accessGrant.update({
        where: { id: grant.id },
        data: { consumedAt: new Date() },
      });
    }
  }

  return { grant, campaign, payload };
}
