import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessGrant, Campaign } from "@prisma/client";

import { signGrantToken } from "@/domain/access/token";
import { requireSecret } from "@/server/config/secrets";

vi.mock("@/server/db", () => ({
  db: {
    accessGrant: { findUnique: vi.fn(), update: vi.fn() },
    campaign: { findUnique: vi.fn() },
    campaignApplication: { findUnique: vi.fn() },
  },
}));

import { db } from "@/server/db";
import {
  AccessDeniedError,
  UaMismatchError,
  validateAccessGrant,
} from "@/server/services/accessService";

const ACCESS_SECRET = requireSecret("ACCESS_SECRET");
const UA = "Firefox/120.0";

const OPEN_WINDOWS = {
  applicationOpensAt: new Date(Date.now() - 60_000),
  applicationClosesAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  testingStartsAt: new Date(Date.now() - 60_000),
  testingEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
};

function tokenFor(grantId: string, campaignId = "c-1", userId = "u-1"): string {
  return signGrantToken(
    {
      grantId,
      campaignId,
      userId,
      watermarkId: 7,
      exp: Math.floor(Date.now() / 1000) + 900,
    },
    ACCESS_SECRET,
  );
}

async function uaHashOf(userAgent: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(userAgent.trim()).digest("hex");
}

async function mockGrant(overrides: {
  buildKind?: string;
  consumedAt?: Date | null;
  revokedAt?: Date | null;
  status?: string;
  uaHash?: string;
}): Promise<void> {
  vi.mocked(db.accessGrant.findUnique).mockResolvedValue({
    id: "g-1",
    userId: "u-1",
    campaignId: "c-1",
    watermarkId: 7,
    uaHash: overrides.uaHash ?? (await uaHashOf(UA)),
    expiresAt: new Date(Date.now() + 600_000),
    consumedAt: overrides.consumedAt ?? null,
    campaign: {
      id: "c-1",
      status: overrides.status ?? "OPEN",
      revokedAt: overrides.revokedAt ?? null,
      buildKind: overrides.buildKind ?? "DOWNLOAD",
      ...OPEN_WINDOWS,
    },
  } as unknown as AccessGrant & { campaign: Campaign });

  vi.mocked(db.campaignApplication.findUnique).mockResolvedValue({
    status: "APPROVED",
  } as never);
}

describe("single-use grants are spent by delivery, not by inspection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not consume a download grant when only validating", async () => {
    // Rendering the session surface calls this. Consuming here would burn the
    // link before the tester had the build — the bug this flag exists for.
    await mockGrant({ buildKind: "DOWNLOAD" });

    const outcome = await validateAccessGrant({
      token: tokenFor("g-1"),
      userAgent: UA,
    });

    expect(outcome.grant.id).toBe("g-1");
    expect(db.accessGrant.update).not.toHaveBeenCalled();
  });

  it("consumes it when the build is actually handed over", async () => {
    await mockGrant({ buildKind: "DOWNLOAD" });

    await validateAccessGrant({
      token: tokenFor("g-1"),
      userAgent: UA,
      consume: true,
    });

    expect(db.accessGrant.update).toHaveBeenCalledTimes(1);
    const call = vi.mocked(db.accessGrant.update).mock.calls[0]![0];
    expect(call.where).toEqual({ id: "g-1" });
    expect(call.data.consumedAt).toBeInstanceOf(Date);
  });

  it("refuses an already-consumed grant even when not consuming", async () => {
    // The flag gates the write, never the check.
    await mockGrant({ buildKind: "DOWNLOAD", consumedAt: new Date() });

    await expect(
      validateAccessGrant({ token: tokenFor("g-1"), userAgent: UA }),
    ).rejects.toThrow(/already been used/);
    expect(db.accessGrant.update).not.toHaveBeenCalled();
  });

  it("never consumes a web build, however it is validated", async () => {
    await mockGrant({ buildKind: "WEB_EMBED" });

    await validateAccessGrant({
      token: tokenFor("g-1"),
      userAgent: UA,
      consume: true,
    });

    expect(db.accessGrant.update).not.toHaveBeenCalled();
  });
});

describe("a refusal says what it was and who it was about", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names the outcome and the campaign on a browser mismatch", async () => {
    // The access log files denials against a campaign. Without this the
    // passed-around-link signal has nowhere to land.
    await mockGrant({ uaHash: await uaHashOf("SomeOtherBrowser/1") });

    await expect(
      validateAccessGrant({ token: tokenFor("g-1"), userAgent: UA }),
    ).rejects.toThrow(UaMismatchError);

    try {
      await validateAccessGrant({ token: tokenFor("g-1"), userAgent: UA });
      expect.unreachable("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(AccessDeniedError);
      const denial = error as AccessDeniedError;
      expect(denial.outcome).toBe("DENIED_UA_MISMATCH");
      expect(denial.context).toEqual({
        campaignId: "c-1",
        userId: "u-1",
        grantId: "g-1",
        buildKind: "DOWNLOAD",
      });
    }
  });

  it("names revocation separately from a bad token", async () => {
    await mockGrant({ revokedAt: new Date() });

    try {
      await validateAccessGrant({ token: tokenFor("g-1"), userAgent: UA });
      expect.unreachable("should have refused");
    } catch (error) {
      const denial = error as AccessDeniedError;
      expect(denial.outcome).toBe("DENIED_REVOKED");
      expect(denial.context?.campaignId).toBe("c-1");
    }
  });

  it("carries no context when nothing parsed", async () => {
    // There is no campaign to file this under, and guessing one would put a
    // fabricated row in an audit trail.
    try {
      await validateAccessGrant({ token: "not-a-token", userAgent: UA });
      expect.unreachable("should have refused");
    } catch (error) {
      const denial = error as AccessDeniedError;
      expect(denial.outcome).toBe("DENIED_INVALID_TOKEN");
      expect(denial.context).toBeNull();
    }
    expect(db.accessGrant.findUnique).not.toHaveBeenCalled();
  });
});
