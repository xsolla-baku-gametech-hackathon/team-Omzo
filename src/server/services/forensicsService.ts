import { decodeWatermark } from "@/domain/watermark/decode";
import { db } from "@/server/db";
import { decodePng } from "@/server/image/png";

/**
 * Identifying the source of a leaked frame (SPEC.md §6.2).
 *
 * The answer is deliberately one of four things rather than a name and a
 * probability. A studio acting on this is about to accuse a person, so
 * "nothing here", "not yours" and "here is who" have to be distinguishable
 * at a glance and impossible to confuse.
 */

export type ForensicResult =
  | { readonly kind: "no_watermark" }
  | {
      readonly kind: "unknown_grant";
      readonly watermarkId: number;
      readonly confidence: number;
    }
  | {
      readonly kind: "other_studio";
      readonly watermarkId: number;
      readonly confidence: number;
    }
  | {
      readonly kind: "identified";
      readonly watermarkId: number;
      readonly confidence: number;
      readonly displayName: string;
      readonly email: string;
      readonly campaignTitle: string;
      readonly issuedAt: Date;
      readonly frameWidth: number;
      readonly frameHeight: number;
    };

export async function identifyFrame(
  png: Buffer,
  studioId: string,
): Promise<ForensicResult> {
  const frame = decodePng(png);
  const decoded = decodeWatermark(frame);

  if (decoded === null) return { kind: "no_watermark" };

  const grant = await db.accessGrant.findUnique({
    where: { watermarkId: decoded.watermarkId },
    select: {
      issuedAt: true,
      user: { select: { displayName: true, email: true } },
      campaign: { select: { title: true, studioId: true } },
    },
  });

  if (grant === null) {
    return {
      kind: "unknown_grant",
      watermarkId: decoded.watermarkId,
      confidence: decoded.confidence,
    };
  }

  // The watermark id is globally unique, so this page needs no campaign
  // picker -- but that is exactly why it needs an ownership check. Without
  // one, any studio could upload a rival's leaked frame and be handed the
  // name and email of a tester who never agreed to anything with them.
  if (grant.campaign.studioId !== studioId) {
    return {
      kind: "other_studio",
      watermarkId: decoded.watermarkId,
      confidence: decoded.confidence,
    };
  }

  return {
    kind: "identified",
    watermarkId: decoded.watermarkId,
    confidence: decoded.confidence,
    displayName: grant.user.displayName,
    email: grant.user.email,
    campaignTitle: grant.campaign.title,
    issuedAt: grant.issuedAt,
    frameWidth: frame.width,
    frameHeight: frame.height,
  };
}
