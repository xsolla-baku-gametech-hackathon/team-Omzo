import { describe, expect, it } from "vitest";

import {
  InvalidCampaignWindowsError,
  assertCampaignWindows,
  canApply,
  canPlay,
} from "@/domain/campaigns/windows";

function windows(partial: {
  appOpen: string;
  appClose: string;
  testStart: string;
  testEnd: string;
}) {
  return {
    applicationOpensAt: new Date(partial.appOpen),
    applicationClosesAt: new Date(partial.appClose),
    testingStartsAt: new Date(partial.testStart),
    testingEndsAt: new Date(partial.testEnd),
  };
}

describe("assertCampaignWindows", () => {
  it("accepts a coherent schedule", () => {
    expect(() =>
      assertCampaignWindows(
        windows({
          appOpen: "2026-09-01T00:00:00Z",
          appClose: "2026-09-10T00:00:00Z",
          testStart: "2026-09-05T00:00:00Z",
          testEnd: "2026-09-20T00:00:00Z",
        }),
        { now: new Date("2026-08-01T00:00:00Z") },
      ),
    ).not.toThrow();
  });

  it("rejects application close after testing end", () => {
    expect(() =>
      assertCampaignWindows(
        windows({
          appOpen: "2026-09-01T00:00:00Z",
          appClose: "2026-09-25T00:00:00Z",
          testStart: "2026-09-05T00:00:00Z",
          testEnd: "2026-09-20T00:00:00Z",
        }),
        { now: new Date("2026-08-01T00:00:00Z") },
      ),
    ).toThrow(InvalidCampaignWindowsError);
  });

  it("rejects applications opening after testing starts", () => {
    expect(() =>
      assertCampaignWindows(
        windows({
          appOpen: "2026-09-10T00:00:00Z",
          appClose: "2026-09-15T00:00:00Z",
          testStart: "2026-09-05T00:00:00Z",
          testEnd: "2026-09-20T00:00:00Z",
        }),
        { now: new Date("2026-08-01T00:00:00Z") },
      ),
    ).toThrow(/Applications cannot open after testing starts/);
  });

  it("rejects testing end in the past on create", () => {
    expect(() =>
      assertCampaignWindows(
        windows({
          appOpen: "2026-01-01T00:00:00Z",
          appClose: "2026-01-10T00:00:00Z",
          testStart: "2026-01-01T00:00:00Z",
          testEnd: "2026-01-20T00:00:00Z",
        }),
        { now: new Date("2026-09-01T00:00:00Z") },
      ),
    ).toThrow(/Testing end must be in the future/);
  });
});

describe("canApply / canPlay", () => {
  const schedule = windows({
    appOpen: "2026-09-01T00:00:00Z",
    appClose: "2026-09-10T00:00:00Z",
    testStart: "2026-09-05T00:00:00Z",
    testEnd: "2026-09-20T00:00:00Z",
  });

  it("blocks apply after close", () => {
    expect(canApply(schedule, new Date("2026-09-11T00:00:00Z"))).toBe(false);
  });

  it("allows late apply while still before close even after testing started", () => {
    expect(canApply(schedule, new Date("2026-09-08T00:00:00Z"))).toBe(true);
    expect(canPlay(schedule, new Date("2026-09-08T00:00:00Z"))).toBe(true);
  });

  it("blocks play before testing starts", () => {
    expect(canPlay(schedule, new Date("2026-09-02T00:00:00Z"))).toBe(false);
    expect(canApply(schedule, new Date("2026-09-02T00:00:00Z"))).toBe(true);
  });

  it("blocks play after testing ends", () => {
    expect(canPlay(schedule, new Date("2026-09-21T00:00:00Z"))).toBe(false);
  });
});
