import { describe, expect, it } from "vitest";

import { buildCampaignAnalytics } from "@/domain/analytics/campaignSummary";
import type { AnalyticsIssueRow } from "@/domain/analytics/campaignSummary";

const issues: AnalyticsIssueRow[] = [
  {
    id: "1",
    title: "Lift freezes on enter",
    category: "GAMEPLAY",
    severity: "HIGH",
    status: "OPEN",
    occurrenceCount: 40,
  },
  {
    id: "2",
    title: "Audio dropout in bunker",
    category: "AUDIO",
    severity: "MEDIUM",
    status: "OPEN",
    occurrenceCount: 25,
  },
  {
    id: "3",
    title: "Null mesh crash",
    category: "CRASH",
    severity: "CRITICAL",
    status: "VERIFIED",
    occurrenceCount: 15,
  },
  {
    id: "4",
    title: "Drone swarm FPS drop",
    category: "PERFORMANCE",
    severity: "HIGH",
    status: "OPEN",
    occurrenceCount: 20,
  },
];

describe("buildCampaignAnalytics", () => {
  it("compresses reports into issues and ranks top problems", () => {
    const summary = buildCampaignAnalytics(issues, {
      totalReports: 120,
      totalIssues: 4,
      noiseCount: 20,
    });

    expect(summary.compressionRatio).toBe(30);
    expect(summary.topIssues[0]?.title).toBe("Lift freezes on enter");
    expect(summary.topIssues[0]?.occurrenceCount).toBe(40);
    expect(summary.byCategory.find((c) => c.key === "GAMEPLAY")?.count).toBe(1);
    expect(summary.bySeverity.find((c) => c.key === "HIGH")?.count).toBe(2);
    expect(summary.bySeverityWeighted.find((c) => c.key === "HIGH")?.count).toBe(
      60,
    );
    expect(summary.headline).toContain("120 reports collapsed into 4 issues");
  });

  it("handles an empty board", () => {
    const summary = buildCampaignAnalytics([], {
      totalReports: 0,
      totalIssues: 0,
      noiseCount: 0,
    });
    expect(summary.topIssues).toEqual([]);
    expect(summary.byCategory).toEqual([]);
    expect(summary.headline).toContain("No clustered issues");
  });
});
