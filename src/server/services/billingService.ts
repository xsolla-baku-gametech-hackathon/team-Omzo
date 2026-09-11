import type { PlanId, Usage } from "@/domain/billing/plans";
import { PLANS, resolvePlan } from "@/domain/billing/plans";
import { deliveryModeOf } from "@/domain/campaigns/delivery";
import { db } from "@/server/db";
import type { BuildKind } from "@prisma/client";

/**
 * A studio's real usage for the current billing period.
 *
 * Every figure is counted from rows that already exist. Nothing here is
 * estimated or projected: a studio looking at an invoice should be able to
 * reconcile it against the board, and a number nobody can reconcile is worse
 * than no number.
 */

function isPlanId(value: string): value is PlanId {
  return PLANS.some((plan) => plan.id === value);
}

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
 * No Subscription row means the free tier. A studio that never touched
 * billing therefore needs no row at all, and the free tier cannot drift out
 * of sync with a record nobody wrote.
 *
 * An unrecognised planId also resolves to free rather than throwing. A plan
 * retired from the catalogue would otherwise take the studio's whole console
 * down on a billing read, and failing closed to the cheapest tier is the
 * direction that cannot overcharge anyone.
 */
export async function getStudioPlanId(studioId: string): Promise<PlanId> {
  const subscription = await db.subscription.findUnique({
    where: { studioId },
    select: { planId: true },
  });
  if (subscription === null) return "free";

  return isPlanId(subscription.planId) ? subscription.planId : "free";
}

export class UnknownPlanError extends Error {
  constructor(planId: string) {
    super(`No such plan: ${planId}`);
    this.name = "UnknownPlanError";
  }
}

/**
 * Moves a studio onto a plan and records why.
 *
 * The event row is the point. Usage accrues across a period but a plan can
 * change inside one, so an invoice cannot be rebuilt from the current plan
 * alone — the history is what answers "what were they on when this accrued".
 * Both writes go in one transaction so a plan can never move without a
 * record of who moved it.
 *
 * This takes no payment. It records an intent, which is all it claims to do.
 */
export async function changeStudioPlan(input: {
  readonly studioId: string;
  readonly actorId: string;
  readonly planId: string;
}): Promise<{ from: PlanId; to: PlanId; changed: boolean }> {
  if (!isPlanId(input.planId)) {
    throw new UnknownPlanError(input.planId);
  }
  const to = input.planId;

  // Self-hosted is an annual licence negotiated with a human. Letting a
  // button grant it would promise something nobody agreed to.
  if (resolvePlan(to).monthlyCents === null) {
    throw new UnknownPlanError(input.planId);
  }

  const from = await getStudioPlanId(input.studioId);
  if (from === to) return { from, to, changed: false };

  await db.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { studioId: input.studioId },
      create: { studioId: input.studioId, planId: to },
      update: { planId: to },
    });
    await tx.subscriptionEvent.create({
      data: {
        studioId: input.studioId,
        // null records the first move off the implicit free tier, which is
        // different from an explicit free-to-free no-op.
        fromPlanId: from === "free" ? null : from,
        toPlanId: to,
        actorId: input.actorId,
      },
    });
  });

  return { from, to, changed: true };
}

/** Plan changes, newest first. */
export async function getPlanHistory(studioId: string, take = 10) {
  return db.subscriptionEvent.findMany({
    where: { studioId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      fromPlanId: true,
      toPlanId: true,
      createdAt: true,
    },
  });
}

export async function getBillingSnapshot(studioId: string, now?: Date) {
  const [usage, planId] = await Promise.all([
    getStudioUsage(studioId, now),
    getStudioPlanId(studioId),
  ]);
  return { usage, plan: resolvePlan(planId) };
}

/**
 * Whether this studio's plan allows another campaign of this kind.
 *
 * A limit nobody enforces is decoration. These two are the ones that decide
 * what a studio pays for, so they are checked before the row is written
 * rather than reported after the fact on a dashboard.
 *
 * Deliberately not a hard stop on anything already running. It refuses the
 * *next* campaign, never an in-flight playtest: a studio discovering mid-test
 * that its testers can no longer file reports is a worse outcome than a late
 * upgrade.
 */
export type CampaignAllowance =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly code: "hosted_delivery_not_in_plan" | "campaign_limit_reached";
      readonly message: string;
    };

export async function checkCampaignAllowance(
  studioId: string,
  buildKind: BuildKind,
  now?: Date,
): Promise<CampaignAllowance> {
  const { usage, plan } = await getBillingSnapshot(studioId, now);

  if (deliveryModeOf(buildKind) === "HOSTED" && !plan.limits.hostedDelivery) {
    return {
      allowed: false,
      code: "hosted_delivery_not_in_plan",
      message:
        "Hosting a build with us — and the frame watermarking that comes with it — is on the Studio plan. Link-only campaigns stay free.",
    };
  }

  const limit = plan.limits.activeCampaigns;
  if (limit !== null && usage.activeCampaigns >= limit) {
    return {
      allowed: false,
      code: "campaign_limit_reached",
      message: `The ${plan.name} plan covers ${limit} active ${
        limit === 1 ? "campaign" : "campaigns"
      }. Close one, or move up a plan to run more at once.`,
    };
  }

  return { allowed: true };
}
