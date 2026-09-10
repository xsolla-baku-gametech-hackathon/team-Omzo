import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Report } from "@prisma/client";

/**
 * Tenancy on the paths that change state.
 *
 * The existing suite proves one studio cannot *read* another's campaign.
 * These are the mutations, which matter more: verify moves coins into
 * testers' balances, and confirm/split decide whether a held report counts
 * toward an occurrence count that rewards are paid against. A tenancy hole
 * on a read leaks; a tenancy hole on one of these lets a stranger spend
 * another studio's reward pool.
 */

vi.mock("@/server/db", () => ({
  db: {
    report: { findUnique: vi.fn(), update: vi.fn() },
    issue: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/server/events", () => ({
  campaignEvents: { emit: vi.fn() },
}));

import { db } from "@/server/db";
import {
  IssueNotFoundError,
  UnauthorizedIssueMutationError,
  confirmDuplicate,
  splitDuplicate,
} from "@/server/services/issueService";

/** A held duplicate belonging to studio-A's campaign. */
function heldReportOwnedBy(studioId: string): unknown {
  return {
    id: "report-1",
    campaignId: "campaign-1",
    issueId: "issue-1",
    isPossibleDuplicate: true,
    campaign: { studioId },
  };
}

describe("studio tenancy on mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const [name, mutate] of [
    ["confirmDuplicate", confirmDuplicate],
    ["splitDuplicate", splitDuplicate],
  ] as const) {
    describe(name, () => {
      it("refuses a studio acting on another studio's report", async () => {
        vi.mocked(db.report.findUnique).mockResolvedValue(
          heldReportOwnedBy("studio-A") as Report,
        );

        await expect(mutate("report-1", "studio-B")).rejects.toThrow(
          UnauthorizedIssueMutationError,
        );
        // The boundary has to hold before any write is attempted.
        expect(db.$transaction).not.toHaveBeenCalled();
      });

      it("refuses an unauthenticated caller", async () => {
        vi.mocked(db.report.findUnique).mockResolvedValue(
          heldReportOwnedBy("studio-A") as Report,
        );

        await expect(mutate("report-1", undefined)).rejects.toThrow(
          UnauthorizedIssueMutationError,
        );
        expect(db.$transaction).not.toHaveBeenCalled();
      });

      it("refuses a caller whose studioId is an empty string", async () => {
        // A session missing studioId used to arrive here as "", which is
        // falsy but would still have compared unequal to a real id. It is
        // rejected explicitly rather than relying on that.
        vi.mocked(db.report.findUnique).mockResolvedValue(
          heldReportOwnedBy("studio-A") as Report,
        );

        await expect(mutate("report-1", "")).rejects.toThrow(
          UnauthorizedIssueMutationError,
        );
        expect(db.report.findUnique).not.toHaveBeenCalled();
      });

      it("reports a missing report as not-found, not as forbidden", async () => {
        // Distinguishing the two would tell an outsider which report ids are
        // real, so both answer the same way.
        vi.mocked(db.report.findUnique).mockResolvedValue(null);

        await expect(mutate("report-1", "studio-A")).rejects.toThrow(
          IssueNotFoundError,
        );
      });

      it("refuses a report that is not actually held for review", async () => {
        vi.mocked(db.report.findUnique).mockResolvedValue({
          ...(heldReportOwnedBy("studio-A") as object),
          isPossibleDuplicate: false,
        } as Report);

        await expect(mutate("report-1", "studio-A")).rejects.toThrow(
          IssueNotFoundError,
        );
        expect(db.$transaction).not.toHaveBeenCalled();
      });

      it("refuses a report not attached to any issue", async () => {
        vi.mocked(db.report.findUnique).mockResolvedValue({
          ...(heldReportOwnedBy("studio-A") as object),
          issueId: null,
        } as Report);

        await expect(mutate("report-1", "studio-A")).rejects.toThrow(
          IssueNotFoundError,
        );
      });
    });
  }
});
