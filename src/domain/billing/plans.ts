/**
 * What a studio pays, and why it is metered this way.
 *
 * Repro is sold to game studios, so this is B2B SaaS. The question that
 * decides everything else is which number the price scales on, and the
 * defensible answer here is the **active tester**: someone who took a build
 * in the billing period.
 *
 * Active testers track the two things the product is actually for. Each one
 * is a distinct watermark identity and a signed NDA record, so they are the
 * leak surface; and report volume, which is what triage saves a developer
 * from reading, scales with them roughly linearly.
 *
 * Rejected alternatives, because a pricing model is only credible next to
 * the ones it beat:
 *
 *   Per developer seat — the value does not move with it. A three-person
 *   team gets the same 400-reports-into-12-issues collapse as a fifty-person
 *   team from the same playtest. It would badly under-monetise the studios
 *   getting the most out of this.
 *
 *   Per report — charges for exactly the behaviour the product wants more of.
 *   Clustering gets *better* with volume, so billing per report would price
 *   against the thing that makes the engine work.
 *
 *   Per campaign — lumpy and easy to game by folding three playtests into one
 *   campaign, and studios run overlapping cycles, so it forecasts badly for
 *   both sides.
 *
 *   A percentage of the tester reward pool — there is nothing to take a
 *   percentage of. Coins are claim tokens redeemable for studio perks with no
 *   monetary exchange mechanism (README, "Virtual Claim Tokens"). Inventing a
 *   cash flow there would contradict the product's own position and drag a
 *   dev tool into money transmission.
 *
 * Amounts are in USD minor units throughout. Currency does not belong in a
 * float, and every figure shown to a studio is derived from these.
 */

export type PlanId = "free" | "studio" | "publisher" | "self_hosted";

/** null means unmetered on that axis. */
export interface PlanLimits {
  readonly activeCampaigns: number | null;
  readonly activeTestersPerMonth: number | null;
  readonly reportsPerMonth: number | null;
  readonly retentionMonths: number;
}

export interface Overage {
  readonly perActiveTesterCents: number;
  /** Reports are billed in whole blocks, so the line item stays readable. */
  readonly per10kReportsCents: number;
}

export interface Plan {
  readonly id: PlanId;
  readonly name: string;
  /** null means the price is negotiated rather than listed. */
  readonly monthlyCents: number | null;
  readonly annualCents: number | null;
  readonly limits: PlanLimits;
  /** null means going over is not billable — it is a hard tier boundary. */
  readonly overage: Overage | null;
  readonly summary: string;
  readonly features: readonly string[];
}

const MONTHS_PER_YEAR = 12;

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    name: "Playtest",
    monthlyCents: 0,
    annualCents: 0,
    limits: {
      activeCampaigns: 1,
      activeTestersPerMonth: 25,
      reportsPerMonth: 2_000,
      retentionMonths: 1,
    },
    overage: null,
    summary: "One campaign, a small tester group, and the full triage engine.",
    features: [
      "Clustering, noise scoring and the live issue board",
      // Watermarking is in the free tier on purpose. It is the product's
      // central promise, and a crippled version of it would teach studios
      // the wrong thing about what they are evaluating.
      "Forensic watermarking and NDA records",
      "30-day report retention",
      "Community support",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    monthlyCents: 29_000,
    annualCents: 29_000 * 10,
    limits: {
      activeCampaigns: null,
      activeTestersPerMonth: 250,
      reportsPerMonth: 50_000,
      retentionMonths: 12,
    },
    overage: { perActiveTesterCents: 120, per10kReportsCents: 800 },
    summary: "For a studio running closed betas on a regular cycle.",
    features: [
      "Unlimited campaigns",
      "250 active testers included, then $1.20 each",
      "Forensics dashboard and watermark recovery",
      "Tamper-evident audit log",
      "12-month retention",
      "Email support",
    ],
  },
  {
    id: "publisher",
    name: "Publisher",
    monthlyCents: 120_000,
    annualCents: 120_000 * 10,
    limits: {
      activeCampaigns: null,
      activeTestersPerMonth: 2_500,
      reportsPerMonth: 500_000,
      retentionMonths: 24,
    },
    overage: { perActiveTesterCents: 60, per10kReportsCents: 500 },
    summary:
      "Multiple titles, multiple teams, and a leak that would make news.",
    features: [
      "2,500 active testers included, then $0.60 each",
      "SSO / SAML and role separation per title",
      "Audit log export",
      "Custom NDA templates per campaign",
      "24-month retention",
      "Priority support with an SLA",
    ],
  },
  {
    id: "self_hosted",
    name: "Self-hosted",
    monthlyCents: null,
    annualCents: null,
    limits: {
      activeCampaigns: null,
      activeTestersPerMonth: null,
      reportsPerMonth: null,
      retentionMonths: 999,
    },
    overage: null,
    summary:
      "For builds that are not allowed to leave your network. Runs with the Wi-Fi off.",
    features: [
      "Everything in Publisher, inside your own infrastructure",
      // This is not a marketing line. Clustering, watermarking and scoring
      // are all local and deterministic, with no model on the critical path,
      // so there is genuinely nothing to phone home about.
      "No outbound calls: triage and watermarking are fully local",
      "Your database, your retention policy",
      "Annual licence with onboarding and support",
    ],
  },
];

export function resolvePlan(id: PlanId): Plan {
  const plan = PLANS.find((candidate) => candidate.id === id);
  if (plan === undefined) {
    throw new Error(`Unknown plan: ${id}`);
  }
  return plan;
}

/** What a studio actually did in the period. */
export interface Usage {
  readonly activeCampaigns: number;
  readonly activeTesters: number;
  readonly reports: number;
}

export type MeterId = "activeCampaigns" | "activeTesters" | "reports";

export interface MeterReading {
  readonly id: MeterId;
  readonly label: string;
  readonly used: number;
  /** null when the plan does not meter this axis. */
  readonly included: number | null;
  /** 0–1, clamped. 0 when unmetered, so a bar renders empty rather than full. */
  readonly ratio: number;
  readonly over: number;
}

const METER_LABELS: Record<MeterId, string> = {
  activeCampaigns: "Active campaigns",
  activeTesters: "Active testers",
  reports: "Reports ingested",
};

function reading(
  id: MeterId,
  used: number,
  included: number | null,
): MeterReading {
  const safeUsed = Math.max(0, used);
  const over =
    included === null ? 0 : Math.max(0, safeUsed - Math.max(0, included));
  const ratio =
    included === null || included <= 0
      ? 0
      : Math.min(1, Math.max(0, safeUsed / included));

  return { id, label: METER_LABELS[id], used: safeUsed, included, ratio, over };
}

export function meter(usage: Usage, plan: Plan): readonly MeterReading[] {
  return [
    reading(
      "activeCampaigns",
      usage.activeCampaigns,
      plan.limits.activeCampaigns,
    ),
    reading(
      "activeTesters",
      usage.activeTesters,
      plan.limits.activeTestersPerMonth,
    ),
    reading("reports", usage.reports, plan.limits.reportsPerMonth),
  ];
}

/**
 * What going over costs this period.
 *
 * Reports bill in whole 10k blocks so the invoice line stays legible; a
 * studio one report over pays for one block, not a fraction of a cent.
 */
export function overageCents(usage: Usage, plan: Plan): number {
  if (plan.overage === null) return 0;

  const readings = meter(usage, plan);
  const testersOver = readings.find((r) => r.id === "activeTesters")?.over ?? 0;
  const reportsOver = readings.find((r) => r.id === "reports")?.over ?? 0;

  return (
    testersOver * plan.overage.perActiveTesterCents +
    Math.ceil(reportsOver / 10_000) * plan.overage.per10kReportsCents
  );
}

/** Base plus overage, or null when the plan is not listed. */
export function monthlyTotalCents(plan: Plan, usage: Usage): number | null {
  if (plan.monthlyCents === null) return null;
  return plan.monthlyCents + overageCents(usage, plan);
}

/** Months free when paying annually, for the "2 months free" line. */
export function annualSavingMonths(plan: Plan): number {
  if (plan.monthlyCents === null || plan.annualCents === null) return 0;
  if (plan.monthlyCents === 0) return 0;
  return MONTHS_PER_YEAR - plan.annualCents / plan.monthlyCents;
}

/**
 * The cheapest listed plan whose included allowances cover this usage.
 *
 * Used to tell a studio it is on the wrong plan before the overage does.
 * Falls back to the most capable listed plan when nothing fits outright,
 * because the honest answer there is "talk to us", not "you owe overage
 * forever".
 */
export function recommendPlan(usage: Usage): Plan {
  const listed = PLANS.filter((plan) => plan.monthlyCents !== null);
  const fits = listed.find((plan) =>
    meter(usage, plan).every((r) => r.over === 0),
  );
  return fits ?? listed[listed.length - 1]!;
}

/** "$290.00", "$1,200.00". */
export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
