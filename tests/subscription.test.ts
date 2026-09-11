import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Plan persistence. These paths decide what a studio is billed, so the
 * failure modes worth pinning are the ones that would silently move money:
 * granting a plan nobody agreed to, losing the record of who changed it, and
 * taking a studio's console down over an unrecognised plan string.
 */

const { subscriptionMock, eventMock, transactionMock } = vi.hoisted(() => ({
  subscriptionMock: { findUnique: vi.fn(), upsert: vi.fn() },
  eventMock: { create: vi.fn(), findMany: vi.fn() },
  transactionMock: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    subscription: subscriptionMock,
    subscriptionEvent: eventMock,
    $transaction: transactionMock,
    campaign: { findMany: vi.fn() },
    accessGrant: { findMany: vi.fn() },
    report: { count: vi.fn() },
  },
}));

import {
  UnknownPlanError,
  changeStudioPlan,
  getStudioPlanId,
} from "@/server/services/billingService";

describe("resolving a studio's plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats no subscription row as the free tier", async () => {
    // A studio that never touched billing needs no row, so free cannot drift
    // out of sync with a record nobody wrote.
    subscriptionMock.findUnique.mockResolvedValue(null);
    await expect(getStudioPlanId("studio-1")).resolves.toBe("free");
  });

  it("returns the stored plan", async () => {
    subscriptionMock.findUnique.mockResolvedValue({ planId: "publisher" });
    await expect(getStudioPlanId("studio-1")).resolves.toBe("publisher");
  });

  it("falls back to free on a plan that is no longer in the catalogue", async () => {
    // A retired plan must not take the whole console down on a billing read,
    // and falling back to the cheapest tier is the direction that cannot
    // overcharge anyone.
    subscriptionMock.findUnique.mockResolvedValue({ planId: "legacy-beta" });
    await expect(getStudioPlanId("studio-1")).resolves.toBe("free");
  });
});

describe("changing plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ subscription: subscriptionMock, subscriptionEvent: eventMock }),
    );
  });

  it("refuses a plan that does not exist", async () => {
    subscriptionMock.findUnique.mockResolvedValue(null);
    await expect(
      changeStudioPlan({
        studioId: "s1",
        actorId: "u1",
        planId: "enterprise-unlimited",
      }),
    ).rejects.toThrow(UnknownPlanError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("refuses to self-serve the negotiated plan", async () => {
    // Self-hosted is an annual licence agreed with a person. A button that
    // granted it would promise something nobody signed.
    subscriptionMock.findUnique.mockResolvedValue(null);
    await expect(
      changeStudioPlan({
        studioId: "s1",
        actorId: "u1",
        planId: "self_hosted",
      }),
    ).rejects.toThrow(UnknownPlanError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("records the first move off free with a null origin", async () => {
    subscriptionMock.findUnique.mockResolvedValue(null);

    const result = await changeStudioPlan({
      studioId: "s1",
      actorId: "u1",
      planId: "studio",
    });

    expect(result).toEqual({ from: "free", to: "studio", changed: true });
    expect(eventMock.create).toHaveBeenCalledWith({
      data: {
        studioId: "s1",
        fromPlanId: null,
        toPlanId: "studio",
        actorId: "u1",
      },
    });
  });

  it("records the origin when moving between paid plans", async () => {
    subscriptionMock.findUnique.mockResolvedValue({ planId: "studio" });

    await changeStudioPlan({
      studioId: "s1",
      actorId: "u1",
      planId: "publisher",
    });

    expect(eventMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromPlanId: "studio",
          toPlanId: "publisher",
        }),
      }),
    );
  });

  it("writes nothing when the plan is already the requested one", async () => {
    // Otherwise a double-clicked button fills the history with no-ops and
    // makes it useless for reconstructing an invoice.
    subscriptionMock.findUnique.mockResolvedValue({ planId: "studio" });

    const result = await changeStudioPlan({
      studioId: "s1",
      actorId: "u1",
      planId: "studio",
    });

    expect(result.changed).toBe(false);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(eventMock.create).not.toHaveBeenCalled();
  });

  it("writes the subscription and its event in one transaction", async () => {
    // A plan must never move without a record of who moved it.
    subscriptionMock.findUnique.mockResolvedValue(null);

    await changeStudioPlan({ studioId: "s1", actorId: "u1", planId: "studio" });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(subscriptionMock.upsert).toHaveBeenCalledTimes(1);
    expect(eventMock.create).toHaveBeenCalledTimes(1);
  });

  it("attributes the change to the acting user, not the studio", async () => {
    subscriptionMock.findUnique.mockResolvedValue(null);

    await changeStudioPlan({
      studioId: "s1",
      actorId: "user-42",
      planId: "studio",
    });

    expect(eventMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: "user-42" }),
      }),
    );
  });
});
