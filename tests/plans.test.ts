import { describe, expect, it } from "vitest";

import {
  PLANS,
  annualSavingMonths,
  formatUsd,
  meter,
  monthlyTotalCents,
  overageCents,
  recommendPlan,
  resolvePlan,
} from "@/domain/billing/plans";

const usage = (activeTesters: number, reports = 0, activeCampaigns = 1) => ({
  activeTesters,
  reports,
  activeCampaigns,
});

describe("plan catalogue", () => {
  it("resolves every listed plan by id", () => {
    for (const plan of PLANS) {
      expect(resolvePlan(plan.id).id).toBe(plan.id);
    }
  });

  it("throws on an unknown plan rather than defaulting to the cheapest", () => {
    // Silently falling back to free would hand out an unpaid tier on a typo.
    expect(() => resolvePlan("enterprise" as never)).toThrow(/Unknown plan/);
  });

  it("keeps every listed price in whole minor units", () => {
    // A fractional cent anywhere means a float crept into the catalogue.
    for (const plan of PLANS) {
      if (plan.monthlyCents !== null) {
        expect(Number.isInteger(plan.monthlyCents)).toBe(true);
      }
      if (plan.annualCents !== null) {
        expect(Number.isInteger(plan.annualCents)).toBe(true);
      }
    }
  });

  it("prices annual at ten months, so the two-months-free claim is true", () => {
    expect(annualSavingMonths(resolvePlan("studio"))).toBe(2);
    expect(annualSavingMonths(resolvePlan("publisher"))).toBe(2);
  });

  it("claims no annual saving on a free or unlisted plan", () => {
    expect(annualSavingMonths(resolvePlan("free"))).toBe(0);
    expect(annualSavingMonths(resolvePlan("self_hosted"))).toBe(0);
  });

  it("keeps free on link-only, and sells hosting as the upgrade", () => {
    // Free is the tier where nothing of ours holds the studio's binary. That
    // is the whole entry pitch, and it is also what a studio pays to leave:
    // hosting is what frame watermarking needs.
    expect(resolvePlan("free").limits.hostedDelivery).toBe(false);
    for (const id of ["studio", "publisher", "self_hosted"] as const) {
      expect(resolvePlan(id).limits.hostedDelivery).toBe(true);
    }
  });

  it("prices against developer-days, not against zero", () => {
    // The objection is "we have no QA budget". A year of Studio has to be
    // obviously cheaper than the couple of developer-days per cycle currently
    // spent reading Discord, or the comparison has to be argued rather than
    // stated.
    expect(resolvePlan("studio").monthlyCents).toBeLessThan(10_000);
  });

  it("charges less per tester as the tier grows", () => {
    const studio = resolvePlan("studio").overage!.perActiveTesterCents;
    const publisher = resolvePlan("publisher").overage!.perActiveTesterCents;
    expect(publisher).toBeLessThan(studio);
  });
});

describe("metering", () => {
  it("reports headroom below the included allowance", () => {
    const [, testers] = meter(usage(100), resolvePlan("studio"));
    expect(testers.used).toBe(100);
    expect(testers.included).toBe(500);
    expect(testers.over).toBe(0);
    expect(testers.ratio).toBeCloseTo(0.2);
  });

  it("clamps the ratio at the allowance so a bar cannot overflow", () => {
    const [, testers] = meter(usage(1_000), resolvePlan("studio"));
    expect(testers.ratio).toBe(1);
    expect(testers.over).toBe(500);
  });

  it("shows an unmetered axis as empty rather than full", () => {
    // Unlimited campaigns rendering as a full bar would read as "at limit".
    const [campaigns] = meter(usage(0, 0, 40), resolvePlan("publisher"));
    expect(campaigns.included).toBeNull();
    expect(campaigns.ratio).toBe(0);
    expect(campaigns.over).toBe(0);
  });

  it("never reports negative usage or negative overage", () => {
    const [, testers] = meter(usage(-5), resolvePlan("studio"));
    expect(testers.used).toBe(0);
    expect(testers.over).toBe(0);
    expect(testers.ratio).toBe(0);
  });
});

describe("overage", () => {
  it("is nothing while inside the allowances", () => {
    expect(overageCents(usage(500, 50_000), resolvePlan("studio"))).toBe(0);
  });

  it("bills each tester past the allowance", () => {
    // 10 over at $0.15
    expect(overageCents(usage(510, 0), resolvePlan("studio"))).toBe(150);
  });

  it("never bills for report volume on a paid plan", () => {
    // Clustering gets better with volume. A per-report line would charge a
    // studio for the product working.
    const studio = resolvePlan("studio");
    expect(studio.limits.reportsPerMonth).toBeNull();
    expect(overageCents(usage(0, 5_000_000), studio)).toBe(0);
    expect(overageCents(usage(0, 5_000_000), resolvePlan("publisher"))).toBe(0);
  });

  it("is zero on a plan with no overage terms", () => {
    // Free has hard boundaries rather than a bill that grows silently.
    expect(overageCents(usage(10_000, 999_999), resolvePlan("free"))).toBe(0);
  });

  it("adds base and overage into the period total", () => {
    const studio = resolvePlan("studio");
    expect(monthlyTotalCents(studio, usage(510, 50_000))).toBe(4_900 + 150);
  });

  it("returns no total for a plan that is negotiated", () => {
    expect(monthlyTotalCents(resolvePlan("self_hosted"), usage(10))).toBeNull();
  });
});

describe("plan recommendation", () => {
  it("keeps a small team on free", () => {
    expect(recommendPlan(usage(20, 300, 1)).id).toBe("free");
  });

  it("moves a second campaign off free even at low volume", () => {
    expect(recommendPlan(usage(5, 10, 2)).id).toBe("studio");
  });

  it("moves a large tester pool up to publisher", () => {
    expect(recommendPlan(usage(900, 10_000, 3)).id).toBe("publisher");

    // Report volume alone never moves a studio up: it is not billable and not
    // a boundary on any paid tier.
    expect(recommendPlan(usage(100, 2_000_000, 2)).id).toBe("studio");
  });

  it("recommends the top listed plan when nothing fits outright", () => {
    // The honest answer past this point is a conversation, not an overage
    // line that grows forever.
    expect(recommendPlan(usage(100_000, 9_000_000, 50)).id).toBe("publisher");
  });
});

describe("formatting", () => {
  it("renders whole dollars with cents", () => {
    expect(formatUsd(4_900)).toBe("$49.00");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("groups thousands", () => {
    expect(formatUsd(19_900)).toBe("$199.00");
    expect(formatUsd(120_000)).toBe("$1,200.00");
  });

  it("renders a sub-dollar overage unit", () => {
    expect(formatUsd(15)).toBe("$0.15");
    expect(formatUsd(8)).toBe("$0.08");
  });
});
