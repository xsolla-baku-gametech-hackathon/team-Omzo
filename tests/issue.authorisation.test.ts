import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked so the suite stays offline and fast. Nothing here needs a database
// to answer the question being asked: who is allowed to do this.
vi.mock("@/server/db", () => ({
  db: {
    issue: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    campaign: { findUnique: vi.fn() },
    report: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { db } from "@/server/db";
import {
  IssueNotFoundError,
  UnauthorizedIssueMutationError,
  getBoardForStudio,
  verifyIssue,
} from "@/server/services/issueService";

/**
 * Verification releases a payout from the studio's reward pool (§6.4), and
 * the board is a studio's unreleased build described in detail. Both are
 * checked in the service layer rather than only in the route, because §6.5
 * says so and because a second caller would otherwise have to remember.
 */

const OWNER = "studio-owner";
const INTRUDER = "studio-intruder";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verifyIssue", () => {
  it("refuses a caller with no studio at all", async () => {
    // The regression this test exists for: the studio id used to be
    // optional and the route passed `session?.studioId`, so an unauthenticated
    // caller passed undefined, the ownership check was skipped, and anyone
    // could verify any issue in any campaign.
    await expect(verifyIssue("issue-1", "")).rejects.toBeInstanceOf(
      UnauthorizedIssueMutationError,
    );
    expect(db.issue.update).not.toHaveBeenCalled();
  });

  it("refuses a studio that does not own the campaign", async () => {
    vi.mocked(db.issue.findUnique).mockResolvedValue({
      id: "issue-1",
      campaign: { studioId: OWNER },
    } as never);

    await expect(verifyIssue("issue-1", INTRUDER)).rejects.toBeInstanceOf(
      UnauthorizedIssueMutationError,
    );
    expect(db.issue.update).not.toHaveBeenCalled();
  });

  it("reports a missing issue as missing, not as forbidden", async () => {
    vi.mocked(db.issue.findUnique).mockResolvedValue(null as never);

    await expect(verifyIssue("nope", OWNER)).rejects.toBeInstanceOf(
      IssueNotFoundError,
    );
  });
});

describe("getBoardForStudio", () => {
  it("refuses a caller with no session", async () => {
    await expect(
      getBoardForStudio("campaign-1", undefined),
    ).rejects.toBeInstanceOf(UnauthorizedIssueMutationError);
    expect(db.campaign.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a studio reading another studio's board", async () => {
    vi.mocked(db.campaign.findUnique).mockResolvedValue({
      studioId: OWNER,
    } as never);

    await expect(
      getBoardForStudio("campaign-1", INTRUDER),
    ).rejects.toBeInstanceOf(UnauthorizedIssueMutationError);
    expect(db.report.findMany).not.toHaveBeenCalled();
  });

  it("returns the board to the studio that owns it", async () => {
    vi.mocked(db.campaign.findUnique).mockResolvedValue({
      studioId: OWNER,
    } as never);
    vi.mocked(db.issue.findMany).mockResolvedValue([] as never);
    vi.mocked(db.report.findMany).mockResolvedValue([] as never);
    vi.mocked(db.report.count).mockResolvedValue(0 as never);

    const board = await getBoardForStudio("campaign-1", OWNER);
    expect(board.stats.totalIssues).toBe(0);
  });
});
