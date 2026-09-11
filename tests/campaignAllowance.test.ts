import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    campaign: { findMany: vi.fn() },
    accessGrant: { findMany: vi.fn() },
    report: { count: vi.fn() },
    subscription: { findUnique: vi.fn() },
  },
}));

import { db } from "@/server/db";
import { checkCampaignAllowance } from "@/server/services/billingService";

function onPlan(planId: string | null, activeCampaigns: number): void {
  vi.mocked(db.subscription.findUnique).mockResolvedValue(
    planId === null ? null : ({ planId } as never),
  );
  vi.mocked(db.campaign.findMany).mockResolvedValue(
    Array.from({ length: activeCampaigns }, (_, i) => ({
      id: `c-${i}`,
      status: "OPEN",
      revokedAt: null,
    })) as never,
  );
  vi.mocked(db.accessGrant.findMany).mockResolvedValue([] as never);
  vi.mocked(db.report.count).mockResolvedValue(0 as never);
}

describe("plan limits are enforced where the row is written", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a hosted build on the free tier and names the upgrade", async () => {
    // Free is link-only. Hosting is what buys frame watermarking, and it is
    // the whole reason to move up a tier.
    onPlan(null, 0);

    const hosted = await checkCampaignAllowance("s-1", "WEB_EMBED");
    expect(hosted.allowed).toBe(false);
    if (!hosted.allowed) {
      expect(hosted.code).toBe("hosted_delivery_not_in_plan");
    }

    const download = await checkCampaignAllowance("s-1", "DOWNLOAD");
    expect(download.allowed).toBe(false);
  });

  it("allows a link-only campaign on the free tier", async () => {
    onPlan(null, 0);
    expect((await checkCampaignAllowance("s-1", "EXTERNAL_LINK")).allowed).toBe(
      true,
    );
  });

  it("refuses the campaign that would exceed the plan's count", async () => {
    onPlan("free", 1);
    const result = await checkCampaignAllowance("s-1", "EXTERNAL_LINK");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("campaign_limit_reached");
      // Singular, because the free allowance is one.
      expect(result.message).toContain("1 active campaign");
    }
  });

  it("lets a paid plan host, and run up to its own count", async () => {
    onPlan("studio", 4);
    expect((await checkCampaignAllowance("s-1", "WEB_EMBED")).allowed).toBe(
      true,
    );

    onPlan("studio", 5);
    const full = await checkCampaignAllowance("s-1", "EXTERNAL_LINK");
    expect(full.allowed).toBe(false);
  });

  it("never limits campaign count on a plan that does not meter it", async () => {
    onPlan("publisher", 400);
    expect((await checkCampaignAllowance("s-1", "WEB_EMBED")).allowed).toBe(
      true,
    );
  });
});
