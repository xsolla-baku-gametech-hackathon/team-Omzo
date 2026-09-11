import type { PlanId, Usage } from "@/domain/billing/plans";
import { resolvePlan } from "@/domain/billing/plans";
import { db } from "@/server/db";

/**
 * A studio's real usage for the current billing period.
 *
 * Every figure is counted from rows that already exist. Nothing here is
 * estimated or projected: a studio looking at an invoice should be able to
 * reconcile it against the board, and a number nobody can reconcile is worse
 * than no number.
 */

export interface BillingPeriod {
  readonly start: Date;
  /** Exclusive. */
  readonly end: Date;
}

/** Calendar months, UTC, so a studio and an invoice agree on the boundary. */
export function currentPeriod(now: Date = new Date()): BillingPeriod {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { start, end };
}

export interface StudioUsage extends Usage {
  readonly period: BillingPeriod;
}

/**
 * Counts the three metered axes for one studio.
 *
 * "Active tester" is a distinct user who was issued a build grant inside the
 * period. AccessGrant keeps one row per tester per campaign for life and
 * re-issuance rewrites issuedAt in place, so that column is the most recent
 * time this person took a build — which is exactly the question being asked.
 *
 * Counting reporters instead would miss the tester who played, found nothing
 * and filed nothing. They still held the build, still carry a watermark
 * identity, and are still the leak surface the price is meant to track.
 */
export async function getStudioUsage(
  studioId: string,
  now: Date = new Date(),
): Promise<StudioUsage> {
  const period = currentPeriod(now);
  const withinPeriod = { gte: period.start, lt: period.end };

  const campaigns = await db.campaign.findMany({
    where: { studioId },
    select: { id: true, status: true, revokedAt: true },
  });

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const activeCampaigns = campaigns.filter(
    (campaign) => campaign.status === "OPEN" && campaign.revokedAt === null,
  ).length;

  // A studio with no campaigns yet has no usage, and querying an empty `in`
  // clause is a table scan with a guaranteed-empty result.
  if (campaignIds.length === 0) {
    return { period, activeCampaigns: 0, activeTesters: 0, reports: 0 };
  }

  const [grants, reports] = await Promise.all([
    db.accessGrant.findMany({
      where: { campaignId: { in: campaignIds }, issuedAt: withinPeriod },
      select: { userId: true },
      distinct: ["userId"],
    }),
    db.report.count({
      where: { campaignId: { in: campaignIds }, createdAt: withinPeriod },
    }),
  ]);

  return {
    period,
    activeCampaigns,
    activeTesters: grants.length,
    reports,
  };
}

/**
 * The plan a studio is on.
 *
 * There is no subscription table yet, so this is the honest placeholder: new
 * studios start on the free tier. It is a single function rather than an
 * inline constant so that wiring a real subscription record later touches one
 * place, and so the panel above it is already built against the right shape.
 */
export async function getStudioPlanId(studioId: string): Promise<PlanId> {
  const studio = await db.studio.findUnique({
    where: { id: studioId },
    select: { id: true },
  });
  if (studio === null) throw new Error(`Unknown studio: ${studioId}`);
  return "free";
}

export async function getBillingSnapshot(studioId: string, now?: Date) {
  const [usage, planId] = await Promise.all([
    getStudioUsage(studioId, now),
    getStudioPlanId(studioId),
  ]);
  return { usage, plan: resolvePlan(planId) };
}
