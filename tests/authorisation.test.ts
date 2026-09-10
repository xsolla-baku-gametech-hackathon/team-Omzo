import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
  AccessGrant,
  Campaign,
  NdaSignature,
  Prisma,
  User,
} from "@prisma/client";

import {
  UnauthorizedCampaignAccessError,
  getStudioCampaign,
} from "@/server/services/campaignService";
import {
  UnderageError,
  InvalidTypedNameError,
  calculateAge,
  hashIp,
  hashNdaBody,
  isValidLegalName,
  signNda,
} from "@/server/services/ndaService";
import {
  AccessRevokedError,
  AccessConsumedError,
  AccessRateLimitExceededError,
  validateAccessGrant,
  issueAccessGrant,
} from "@/server/services/accessService";
import { signGrantToken } from "@/domain/access/token";
import { requireSecret } from "@/server/config/secrets";

// Mock the database client so the test runs completely offline in CI
vi.mock("@/server/db", () => {
  return {
    db: {
      campaign: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      ndaSignature: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      accessGrant: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

import { db } from "@/server/db";

describe("Authorisation & Security Layer (SPEC.md §6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Studio Tenancy Boundary (§6.5)", () => {
    it("a studio cannot read another studio's campaign", async () => {
      const studioACampaign = {
        id: "campaign-1",
        studioId: "studio-A",
        title: "Studio A Game",
        status: "OPEN",
      };

      vi.mocked(db.campaign.findUnique).mockResolvedValue(
        studioACampaign as unknown as Campaign,
      );

      // Studio A accesses Studio A's campaign -> OK
      const result = await getStudioCampaign("campaign-1", "studio-A");
      expect(result.id).toBe("campaign-1");

      // Studio B attempts to access Studio A's campaign -> REJECTED
      await expect(getStudioCampaign("campaign-1", "studio-B")).rejects.toThrow(
        UnauthorizedCampaignAccessError,
      );
    });
  });

  describe("NDA & Age Gate (§6.3)", () => {
    it("computes age accurately from birthDate", () => {
      const now = new Date("2026-09-10");
      expect(calculateAge(new Date("2008-09-09"), now)).toBe(18);
      expect(calculateAge(new Date("2008-09-11"), now)).toBe(17);
      expect(calculateAge(new Date("2000-01-01"), now)).toBe(26);
    });

    it("rejects an under-18 user from signing an NDA", async () => {
      const now = new Date();
      const underageBirthDate = new Date(
        now.getFullYear() - 17,
        now.getMonth(),
        now.getDate(),
      );

      vi.mocked(db.campaign.findUnique).mockResolvedValue({
        id: "campaign-1",
        status: "OPEN",
        revokedAt: null,
        ndaBodyMd: "Confidentiality terms",
      } as unknown as Campaign);

      vi.mocked(db.user.findUnique).mockResolvedValue({
        id: "user-minor",
        birthDate: underageBirthDate,
      } as unknown as User);

      await expect(
        signNda({
          userId: "user-minor",
          campaignId: "campaign-1",
          typedName: "Minor Player",
          userAgent: "Mozilla/5.0",
          clientIp: "127.0.0.1",
        }),
      ).rejects.toThrow(UnderageError);
    });

    it("requires a full legal name with both first and last name", async () => {
      expect(isValidLegalName("John").valid).toBe(false);
      expect(isValidLegalName("ad").valid).toBe(false);
      expect(isValidLegalName("A B").valid).toBe(false);
      expect(isValidLegalName("John123 Doe").valid).toBe(false);
      expect(isValidLegalName("John Doe!").valid).toBe(false);
      expect(isValidLegalName("John Doe").valid).toBe(true);
      expect(isValidLegalName("Əli Əliyev").valid).toBe(true);
      expect(isValidLegalName("Mary-Jane Watson").valid).toBe(true);

      const adultBirthDate = new Date("1995-01-01");
      vi.mocked(db.campaign.findUnique).mockResolvedValue({
        id: "campaign-1",
        status: "OPEN",
        revokedAt: null,
        ndaBodyMd: "Terms",
      } as unknown as Campaign);
      vi.mocked(db.user.findUnique).mockResolvedValue({
        id: "user-adult",
        birthDate: adultBirthDate,
      } as unknown as User);

      // Single word name rejected
      await expect(
        signNda({
          userId: "user-adult",
          campaignId: "campaign-1",
          typedName: "Ziyad",
          userAgent: "Mozilla/5.0",
          clientIp: "127.0.0.1",
        }),
      ).rejects.toThrow(InvalidTypedNameError);
    });

    it("hashes IP with salt and hashes exact NDA markdown (§4)", () => {
      const ip = "192.168.1.50";
      const hash1 = hashIp(ip);
      const hash2 = hashIp(ip);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toContain(ip); // Never contains raw IP

      const md = "# NDA terms";
      expect(hashNdaBody(md)).toBe(hashNdaBody(md));
    });
  });

  describe("Access Grant Binding & Validation (§6.1)", () => {
    // Resolved through the same loader the service uses, so the test signs
    // with whatever key production would. Duplicating the literal here is how
    // the committed fallback survived as long as it did.
    const ACCESS_SECRET = requireSecret("ACCESS_SECRET");

    it("rejects an access link opened in a browser with a different User-Agent", async () => {
      const grantId = "grant-xyz";
      const campaignId = "campaign-1";
      const userId = "tester-1";
      const watermarkId = 42;
      const originalUa = "Firefox/120.0 (Original Browser)";
      const differentUa = "Chrome/128.0 (Copied to Another Browser)";

      const token = signGrantToken(
        {
          grantId,
          campaignId,
          userId,
          watermarkId,
          exp: Math.floor(Date.now() / 1000) + 900,
        },
        ACCESS_SECRET,
      );

      // Create sha256 of original UA
      const { createHash } = await import("node:crypto");
      const originalUaHash = createHash("sha256")
        .update(originalUa.trim())
        .digest("hex");

      vi.mocked(db.accessGrant.findUnique).mockResolvedValue({
        id: grantId,
        campaignId,
        userId,
        watermarkId,
        uaHash: originalUaHash,
        expiresAt: new Date(Date.now() + 600000),
        consumedAt: null,
        campaign: {
          id: campaignId,
          status: "OPEN",
          revokedAt: null,
          buildKind: "WEB_EMBED",
        },
      } as unknown as AccessGrant & { campaign: Campaign });

      // Same browser -> OK
      const validOutcome = await validateAccessGrant({
        token,
        userAgent: originalUa,
      });
      expect(validOutcome.grant.id).toBe(grantId);

      // Copied to another browser -> REJECTED with explicit message
      await expect(
        validateAccessGrant({
          token,
          userAgent: differentUa,
        }),
      ).rejects.toThrow(
        "This access link belongs to another tester. Request your own from the campaign page.",
      );
    });

    it("rejects access immediately if campaign was revoked", async () => {
      const grantId = "grant-revoked";
      const token = signGrantToken(
        {
          grantId,
          campaignId: "c-1",
          userId: "u-1",
          watermarkId: 10,
          exp: Math.floor(Date.now() / 1000) + 900,
        },
        ACCESS_SECRET,
      );

      const ua = "Browser/1.0";
      const { createHash } = await import("node:crypto");
      const uaHash = createHash("sha256").update(ua).digest("hex");

      vi.mocked(db.accessGrant.findUnique).mockResolvedValue({
        id: grantId,
        uaHash,
        expiresAt: new Date(Date.now() + 600000),
        consumedAt: null,
        campaign: {
          id: "c-1",
          status: "OPEN",
          revokedAt: new Date(), // Revoked!
        },
      } as unknown as AccessGrant & { campaign: Campaign });

      await expect(
        validateAccessGrant({ token, userAgent: ua }),
      ).rejects.toThrow(AccessRevokedError);
    });

    it("rejects already consumed single-use download links", async () => {
      const grantId = "grant-download";
      const token = signGrantToken(
        {
          grantId,
          campaignId: "c-1",
          userId: "u-1",
          watermarkId: 10,
          exp: Math.floor(Date.now() / 1000) + 900,
        },
        ACCESS_SECRET,
      );

      const ua = "Browser/1.0";
      const { createHash } = await import("node:crypto");
      const uaHash = createHash("sha256").update(ua).digest("hex");

      vi.mocked(db.accessGrant.findUnique).mockResolvedValue({
        id: grantId,
        uaHash,
        expiresAt: new Date(Date.now() + 600000),
        consumedAt: new Date(), // Already consumed!
        campaign: {
          id: "c-1",
          status: "OPEN",
          revokedAt: null,
          buildKind: "DOWNLOAD",
        },
      } as unknown as AccessGrant & { campaign: Campaign });

      await expect(
        validateAccessGrant({ token, userAgent: ua }),
      ).rejects.toThrow(AccessConsumedError);
    });

    it("enforces rolling 1-hour rate limit on grant re-issuance (§6.1)", async () => {
      vi.mocked(db.campaign.findUnique).mockResolvedValue({
        id: "c-1",
        status: "OPEN",
        revokedAt: null,
      } as unknown as Campaign);

      vi.mocked(db.ndaSignature.findUnique).mockResolvedValue({
        id: "sig-1",
      } as unknown as NdaSignature);

      const existingGrant = {
        id: "g-1",
        userId: "u-1",
        campaignId: "c-1",
        watermarkId: 888,
        issuanceCount: 5, // Maxed out
        windowStartedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      };

      vi.mocked(db.$transaction).mockImplementation(
        async (
          callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
        ) => {
          return callback({
            accessGrant: {
              findUnique: vi.fn().mockResolvedValue(existingGrant),
            },
          } as unknown as Prisma.TransactionClient);
        },
      );

      await expect(
        issueAccessGrant({
          userId: "u-1",
          campaignId: "c-1",
          userAgent: "Browser/1.0",
        }),
      ).rejects.toThrow(AccessRateLimitExceededError);
    });
  });
});
