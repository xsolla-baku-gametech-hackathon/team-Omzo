import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessGrant, Campaign, NdaSignature } from "@prisma/client";

import { signGrantToken } from "@/domain/access/token";
import { requireSecret } from "@/server/config/secrets";

vi.mock("@/server/db", () => ({
  db: {
    accessGrant: { findUnique: vi.fn(), update: vi.fn() },
    campaign: { findUnique: vi.fn() },
    campaignApplication: { findUnique: vi.fn(), count: vi.fn() },
    ndaSignature: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { db } from "@/server/db";
import {
  AccessOutsideWindowError,
  AccessNotApprovedError,
  ApplicationRequiredError,
  issueAccessGrant,
  validateAccessGrant,
} from "@/server/services/accessService";
import {
  CampaignNotOpenError,
  TesterNotApprovedError,
  ingestReport,
} from "@/server/services/ingestService";
import {
  SeatsFullError,
  approveApplication,
} from "@/server/services/applicationService";

const ACCESS_SECRET = requireSecret("ACCESS_SECRET");
const UA = "Firefox/120.0";

const OPEN_WINDOWS = {
  applicationOpensAt: new Date(Date.now() - 60_000),
  applicationClosesAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  testingStartsAt: new Date(Date.now() - 60_000),
  testingEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
};

const CLOSED_TEST_WINDOWS = {
  ...OPEN_WINDOWS,
  testingStartsAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
  testingEndsAt: new Date(Date.now() - 60_000),
};

async function uaHashOf(userAgent: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(userAgent.trim()).digest("hex");
}

describe("DOWNLOAD trust gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to issue a grant without studio approval", async () => {
    vi.mocked(db.campaign.findUnique).mockResolvedValue({
      id: "c-1",
      status: "OPEN",
      revokedAt: null,
      buildKind: "DOWNLOAD",
      ...OPEN_WINDOWS,
    } as unknown as Campaign);
    vi.mocked(db.ndaSignature.findUnique).mockResolvedValue({
      id: "sig-1",
    } as unknown as NdaSignature);
    vi.mocked(db.campaignApplication.findUnique).mockResolvedValue(null);

    await expect(
      issueAccessGrant({
        userId: "u-1",
        campaignId: "c-1",
        userAgent: UA,
      }),
    ).rejects.toThrow(ApplicationRequiredError);
  });

  it("refuses validate when the tester is not approved", async () => {
    const token = signGrantToken(
      {
        grantId: "g-1",
        campaignId: "c-1",
        userId: "u-1",
        watermarkId: 3,
        exp: Math.floor(Date.now() / 1000) + 900,
      },
      ACCESS_SECRET,
    );

    vi.mocked(db.accessGrant.findUnique).mockResolvedValue({
      id: "g-1",
      userId: "u-1",
      campaignId: "c-1",
      uaHash: await uaHashOf(UA),
      expiresAt: new Date(Date.now() + 600_000),
      consumedAt: null,
      campaign: {
        id: "c-1",
        status: "OPEN",
        revokedAt: null,
        buildKind: "DOWNLOAD",
        ...OPEN_WINDOWS,
      },
    } as unknown as AccessGrant & { campaign: Campaign });
    vi.mocked(db.campaignApplication.findUnique).mockResolvedValue({
      status: "PENDING",
    } as never);

    await expect(
      validateAccessGrant({ token, userAgent: UA }),
    ).rejects.toThrow(AccessNotApprovedError);
  });

  it("refuses validate after testingEndsAt", async () => {
    const token = signGrantToken(
      {
        grantId: "g-1",
        campaignId: "c-1",
        userId: "u-1",
        watermarkId: 3,
        exp: Math.floor(Date.now() / 1000) + 900,
      },
      ACCESS_SECRET,
    );

    vi.mocked(db.accessGrant.findUnique).mockResolvedValue({
      id: "g-1",
      userId: "u-1",
      campaignId: "c-1",
      uaHash: await uaHashOf(UA),
      expiresAt: new Date(Date.now() + 600_000),
      consumedAt: null,
      campaign: {
        id: "c-1",
        status: "OPEN",
        revokedAt: null,
        buildKind: "DOWNLOAD",
        ...CLOSED_TEST_WINDOWS,
      },
    } as unknown as AccessGrant & { campaign: Campaign });
    vi.mocked(db.campaignApplication.findUnique).mockResolvedValue({
      status: "APPROVED",
    } as never);

    await expect(
      validateAccessGrant({ token, userAgent: UA }),
    ).rejects.toThrow(AccessOutsideWindowError);
  });

  it("rejects ingest after testingEndsAt", async () => {
    vi.mocked(db.campaign.findUnique).mockResolvedValue({
      status: "OPEN",
      revokedAt: null,
      buildKind: "WEB_EMBED",
      ...CLOSED_TEST_WINDOWS,
    } as never);

    await expect(
      ingestReport({
        campaignId: "c-1",
        reporterId: "u-1",
        body: "Fell through the floor near the lift",
        gameState: {
          scene: "atrium",
          x: 0,
          y: 0,
          z: 0,
          playtimeSec: 12,
        },
        systemInfo: {
          os: "macOS",
          browser: "Chrome",
          gpuRenderer: "Apple",
          screen: "1920x1080",
        },
        consoleTail: [],
      }),
    ).rejects.toThrow(CampaignNotOpenError);
  });

  it("rejects DOWNLOAD ingest without approval", async () => {
    vi.mocked(db.campaign.findUnique).mockResolvedValue({
      status: "OPEN",
      revokedAt: null,
      buildKind: "DOWNLOAD",
      ...OPEN_WINDOWS,
    } as never);
    vi.mocked(db.campaignApplication.findUnique).mockResolvedValue({
      status: "PENDING",
    } as never);

    await expect(
      ingestReport({
        campaignId: "c-1",
        reporterId: "u-1",
        body: "Fell through the floor near the lift",
        gameState: {
          scene: "atrium",
          x: 0,
          y: 0,
          z: 0,
          playtimeSec: 12,
        },
        systemInfo: {
          os: "macOS",
          browser: "Chrome",
          gpuRenderer: "Apple",
          screen: "1920x1080",
        },
        consoleTail: [],
      }),
    ).rejects.toThrow(TesterNotApprovedError);
  });

  it("refuses approve when seats are full", async () => {
    vi.mocked(db.campaign.findUnique).mockResolvedValue({
      id: "c-1",
      studioId: "studio-1",
      buildKind: "DOWNLOAD",
      maxTesters: 1,
      status: "OPEN",
      revokedAt: null,
    } as never);

    vi.mocked(db.$transaction).mockImplementation(async (callback) => {
      const tx = {
        campaignApplication: {
          findUnique: vi.fn().mockResolvedValue({
            id: "app-1",
            campaignId: "c-1",
            status: "PENDING",
          }),
          count: vi.fn().mockResolvedValue(1),
          update: vi.fn(),
        },
      };
      return callback(tx as never);
    });

    await expect(
      approveApplication({
        applicationId: "app-1",
        campaignId: "c-1",
        studioId: "studio-1",
        resolverId: "owner-1",
      }),
    ).rejects.toThrow(SeatsFullError);
  });
});
