import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signGrantToken } from "@/domain/access/token";
import { authenticateIngest } from "@/server/auth/ingestAuth";
import { requireSecret } from "@/server/config/secrets";

/**
 * The regression these tests exist for: /api/ingest used to read `reporterId`
 * straight out of the request body, so anyone could file a report as anyone.
 * The reporter drives noise penalties and reward payouts, so the identity a
 * request asserts must never be the identity the server records.
 */

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("@/server/session", () => ({ getSession: getSessionMock }));

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://repro.test/api/ingest", {
    method: "POST",
    headers,
  });
}

function tokenFor(userId: string, campaignId = "camp-1", ttlSec = 600): string {
  return signGrantToken(
    {
      grantId: "grant-1",
      campaignId,
      userId,
      watermarkId: 7,
      exp: Math.floor(Date.now() / 1000) + ttlSec,
    },
    requireSecret("ACCESS_SECRET"),
  );
}

describe("ingest authentication", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a request carrying no credential at all", async () => {
    expect(await authenticateIngest(request())).toBeNull();
  });

  it("refuses a forged bearer token", async () => {
    const forged = `${btoa("{}")}.${btoa("nope")}`;
    expect(
      await authenticateIngest(request({ authorization: `Bearer ${forged}` })),
    ).toBeNull();
  });

  it("refuses a token signed with the wrong key", async () => {
    const wrongKey = signGrantToken(
      {
        grantId: "grant-1",
        campaignId: "camp-1",
        userId: "tester-04",
        watermarkId: 7,
        exp: Math.floor(Date.now() / 1000) + 600,
      },
      "an-entirely-different-secret-of-sufficient-length",
    );

    expect(
      await authenticateIngest(
        request({ authorization: `Bearer ${wrongKey}` }),
      ),
    ).toBeNull();
  });

  it("refuses an expired token", async () => {
    const expired = tokenFor("tester-04", "camp-1", -60);
    expect(
      await authenticateIngest(request({ authorization: `Bearer ${expired}` })),
    ).toBeNull();
  });

  it("refuses an Authorization header that is not a bearer scheme", async () => {
    expect(
      await authenticateIngest(
        request({ authorization: "Basic dXNlcjpwdw==" }),
      ),
    ).toBeNull();
  });

  it("refuses an empty bearer value", async () => {
    expect(
      await authenticateIngest(request({ authorization: "Bearer " })),
    ).toBeNull();
  });

  it("takes the user and campaign from a valid token's signature", async () => {
    const principal = await authenticateIngest(
      request({ authorization: `Bearer ${tokenFor("tester-07", "camp-9")}` }),
    );

    expect(principal).toEqual({
      userId: "tester-07",
      campaignId: "camp-9",
      via: "grant_token",
    });
  });

  it("prefers the token over a session for a different user", async () => {
    // The attack shape: hold one valid credential, try to act as someone else.
    getSessionMock.mockResolvedValue({
      sub: "tester-01",
      email: "a@b.c",
      role: "TESTER",
      displayName: "A",
    });

    const principal = await authenticateIngest(
      request({ authorization: `Bearer ${tokenFor("tester-07")}` }),
    );

    expect(principal?.userId).toBe("tester-07");
  });

  it("falls back to the first-party session when no token is sent", async () => {
    getSessionMock.mockResolvedValue({
      sub: "tester-02",
      email: "a@b.c",
      role: "TESTER",
      displayName: "A",
    });

    expect(await authenticateIngest(request())).toEqual({
      userId: "tester-02",
      via: "session",
    });
  });

  it("does not let a session caller name their own campaign scope", async () => {
    // Session principals carry no campaignId, so the route falls back to the
    // body; a token principal pins it. This asserts the shape that difference
    // depends on.
    getSessionMock.mockResolvedValue({
      sub: "tester-02",
      email: "a@b.c",
      role: "TESTER",
      displayName: "A",
    });

    const principal = await authenticateIngest(request());
    expect(principal?.campaignId).toBeUndefined();
  });
});
