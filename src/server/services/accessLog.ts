import type { AccessEvent, AccessOutcome, BuildKind } from "@prisma/client";

import { db } from "@/server/db";
import { hashUserAgent } from "@/server/services/accessService";
import { getStudioCampaign } from "@/server/services/campaignService";
import { hashIp } from "@/server/services/ndaService";

/**
 * The append-only record of who reached a build, and who was turned away.
 *
 * AccessGrant cannot answer this. It holds one row per tester per campaign
 * for life and rewrites it on re-issuance, so it knows when someone last
 * asked and nothing about the times before that. After a leak the studio's
 * question is "who opened this build, and when" — and that needs a row per
 * attempt.
 *
 * Refusals are recorded as well as grants. A run of DENIED_UA_MISMATCH rows
 * against one grant is someone passing an access link around, and that is
 * exactly the signal a studio wants before the build is on a torrent site,
 * not after.
 */

export interface AccessEventInput {
  readonly campaignId: string;
  readonly userId: string | null;
  readonly grantId: string | null;
  readonly outcome: AccessOutcome;
  readonly buildKind: BuildKind;
  readonly userAgent: string;
  readonly clientIp: string;
}

/**
 * Writes one attempt. Never throws.
 *
 * A failed write here must not deny a tester the build. This log is evidence,
 * not an authorisation gate — the decision was already made by
 * `validateAccessGrant`, and it is made the same way whether or not this row
 * lands. Failing closed would trade a certain harm (every tester locked out
 * while the table is unavailable) for a speculative one, so the failure is
 * made loud in the server log and the request continues.
 */
export async function recordAccessEvent(
  input: AccessEventInput,
): Promise<void> {
  try {
    await db.accessEvent.create({
      data: {
        campaignId: input.campaignId,
        userId: input.userId,
        grantId: input.grantId,
        outcome: input.outcome,
        buildKind: input.buildKind,
        uaHash: hashUserAgent(input.userAgent),
        // Never the raw address, on the same terms as the NDA record: the
        // salt is what keeps a four-billion-value space from being reversible.
        ipHash: hashIp(input.clientIp),
      },
    });
  } catch (error) {
    console.error("[accessLog] failed to record access event", error);
  }
}

export interface AccessEventRow {
  readonly id: string;
  readonly userId: string | null;
  readonly outcome: AccessOutcome;
  readonly buildKind: BuildKind;
  readonly createdAt: Date;
}

/**
 * The access trail for one campaign, newest first.
 *
 * Tenancy is checked by loading the campaign through the studio-scoped
 * loader, which throws when the campaign belongs to someone else. Filtering
 * on campaignId alone would let any studio read any campaign's trail by
 * guessing an id.
 */
export async function listAccessEvents(
  campaignId: string,
  studioId: string,
  limit = 100,
): Promise<readonly AccessEventRow[]> {
  await getStudioCampaign(campaignId, studioId);

  const events: AccessEvent[] = await db.accessEvent.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, limit), 500),
  });

  // uaHash and ipHash stay server-side. They are forensic material, not
  // something a campaign dashboard has a reason to render.
  return events.map((event) => ({
    id: event.id,
    userId: event.userId,
    outcome: event.outcome,
    buildKind: event.buildKind,
    createdAt: event.createdAt,
  }));
}
