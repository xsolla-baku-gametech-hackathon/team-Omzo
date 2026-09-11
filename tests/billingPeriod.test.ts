import { describe, expect, it } from "vitest";

import { currentPeriod } from "@/server/services/billingService";

/**
 * The period boundary decides which side of an invoice a report lands on, so
 * it is worth pinning independently of the database.
 */
describe("billing period", () => {
  it("runs from the first of the month to the first of the next", () => {
    const { start, end } = currentPeriod(new Date("2026-09-11T04:30:00Z"));

    expect(start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("rolls the year over in December", () => {
    const { start, end } = currentPeriod(new Date("2026-12-20T12:00:00Z"));

    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("handles a February in a leap year without losing a day", () => {
    const { start, end } = currentPeriod(new Date("2028-02-29T23:59:59Z"));

    expect(start.toISOString()).toBe("2028-02-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2028-03-01T00:00:00.000Z");
  });

  it("puts the last instant of a month inside that month", () => {
    // end is exclusive, so 23:59:59.999 on the 30th must still be September.
    const instant = new Date("2026-09-30T23:59:59.999Z");
    const { start, end } = currentPeriod(instant);

    expect(instant.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(instant.getTime()).toBeLessThan(end.getTime());
  });

  it("puts the first instant of a month in the new period, not the old one", () => {
    const instant = new Date("2026-10-01T00:00:00.000Z");
    const september = currentPeriod(new Date("2026-09-15T00:00:00Z"));
    const october = currentPeriod(instant);

    expect(instant.getTime()).toBe(september.end.getTime());
    expect(instant.getTime()).toBe(october.start.getTime());
  });

  it("is computed in UTC so a studio and an invoice agree on the boundary", () => {
    // A local-time boundary would move the cut-off by the server's offset and
    // shift reports between invoices depending on where it runs.
    const lateUtc = currentPeriod(new Date("2026-09-01T00:30:00Z"));
    expect(lateUtc.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
