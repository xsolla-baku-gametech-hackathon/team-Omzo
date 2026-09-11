import {
  canApply,
  type CampaignWindows,
} from "@/domain/campaigns/windows";
import { trustLevelOf, trustTierOf } from "@/domain/trust/level";
import { db } from "@/server/db";
import type {
  ApplicationStatus,
  CampaignApplication,
  Prisma,
} from "@prisma/client";

/**
 * DOWNLOAD apply / approve queue.
 *
 * Link and web campaigns never touch this path — only binary delivery needs
 * a studio human to admit each tester before NDA + grant.
 */

export class ApplicationNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationNotAllowedError";
  }
}

export class ApplicationNotFoundError extends Error {
  constructor(applicationId: string) {
    super(`Application ${applicationId} was not found.`);
    this.name = "ApplicationNotFoundError";
  }
}

export class ApplicationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationConflictError";
  }
}

export class SeatsFullError extends Error {
  constructor() {
    super("This campaign has no remaining tester seats.");
    this.name = "SeatsFullError";
  }
}

function windowsOf(campaign: CampaignWindows): CampaignWindows {
  return {
    applicationOpensAt: campaign.applicationOpensAt,
    applicationClosesAt: campaign.applicationClosesAt,
    testingStartsAt: campaign.testingStartsAt,
    testingEndsAt: campaign.testingEndsAt,
  };
}

export async function applyToCampaign(input: {
  readonly campaignId: string;
  readonly testerId: string;
  readonly message?: string;
}): Promise<CampaignApplication> {
  const campaign = await db.campaign.findUnique({
    where: { id: input.campaignId },
    select: {
      id: true,
      status: true,
      revokedAt: true,
      buildKind: true,
      maxTesters: true,
      applicationOpensAt: true,
      applicationClosesAt: true,
      testingStartsAt: true,
      testingEndsAt: true,
    },
  });

  if (
    campaign === null ||
    campaign.status !== "OPEN" ||
    campaign.revokedAt !== null
  ) {
    throw new ApplicationNotAllowedError(
      "This campaign is not accepting applications.",
    );
  }

  if (campaign.buildKind !== "DOWNLOAD") {
    throw new ApplicationNotAllowedError(
      "Only download campaigns require an application.",
    );
  }

  if (!canApply(windowsOf(campaign))) {
    throw new ApplicationNotAllowedError(
      "The application window for this campaign is closed.",
    );
  }

  const approvedCount = await db.campaignApplication.count({
    where: { campaignId: campaign.id, status: "APPROVED" },
  });
  if (approvedCount >= campaign.maxTesters) {
    throw new SeatsFullError();
  }

  const existing = await db.campaignApplication.findUnique({
    where: {
      campaignId_testerId: {
        campaignId: input.campaignId,
        testerId: input.testerId,
      },
    },
  });

  if (existing !== null) {
    if (existing.status === "DENIED" || existing.status === "WITHDRAWN") {
      return db.campaignApplication.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          message: input.message?.trim() || null,
          resolvedAt: null,
          resolvedById: null,
        },
      });
    }
    throw new ApplicationConflictError(
      existing.status === "APPROVED"
        ? "You are already approved for this campaign."
        : "You already have a pending application.",
    );
  }

  return db.campaignApplication.create({
    data: {
      campaignId: input.campaignId,
      testerId: input.testerId,
      message: input.message?.trim() || null,
      status: "PENDING",
    },
  });
}

export interface ApplicantRow {
  readonly id: string;
  readonly status: ApplicationStatus;
  readonly message: string | null;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  readonly tester: {
    readonly id: string;
    readonly displayName: string;
    readonly signalScore: number;
    readonly trustLevel: number;
    readonly trustTier: string;
    readonly verifiedIssues: number;
  };
}

export async function listCampaignApplications(
  campaignId: string,
  studioId: string,
): Promise<readonly ApplicantRow[]> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { studioId: true },
  });
  if (campaign === null || campaign.studioId !== studioId) {
    throw new ApplicationNotFoundError(campaignId);
  }

  const rows = await db.campaignApplication.findMany({
    where: { campaignId },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      tester: {
        select: {
          id: true,
          displayName: true,
          signalScore: true,
        },
      },
    },
  });

  const testerIds = rows.map((row) => row.testerId);
  const verifiedCounts = await db.issue.groupBy({
    by: ["firstReporterId"],
    where: {
      firstReporterId: { in: testerIds },
      status: "VERIFIED",
    },
    _count: { _all: true },
  });
  const verifiedByTester = new Map(
    verifiedCounts.map((row) => [row.firstReporterId, row._count._all]),
  );

  return rows.map((row) => {
    const level = trustLevelOf(row.tester.signalScore);
    return {
      id: row.id,
      status: row.status,
      message: row.message,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      tester: {
        id: row.tester.id,
        displayName: row.tester.displayName,
        signalScore: row.tester.signalScore,
        trustLevel: level,
        trustTier: trustTierOf(level),
        verifiedIssues: verifiedByTester.get(row.testerId) ?? 0,
      },
    };
  });
}

async function resolveApplication(input: {
  readonly applicationId: string;
  readonly campaignId: string;
  readonly studioId: string;
  readonly resolverId: string;
  readonly status: "APPROVED" | "DENIED";
}): Promise<CampaignApplication> {
  const campaign = await db.campaign.findUnique({
    where: { id: input.campaignId },
    select: {
      id: true,
      studioId: true,
      buildKind: true,
      maxTesters: true,
      status: true,
      revokedAt: true,
    },
  });

  if (
    campaign === null ||
    campaign.studioId !== input.studioId ||
    campaign.buildKind !== "DOWNLOAD"
  ) {
    throw new ApplicationNotFoundError(input.applicationId);
  }

  if (campaign.status !== "OPEN" || campaign.revokedAt !== null) {
    throw new ApplicationNotAllowedError(
      "This campaign is not accepting decisions right now.",
    );
  }

  return db.$transaction(async (tx) => {
    const application = await tx.campaignApplication.findUnique({
      where: { id: input.applicationId },
    });

    if (
      application === null ||
      application.campaignId !== input.campaignId
    ) {
      throw new ApplicationNotFoundError(input.applicationId);
    }

    if (application.status !== "PENDING") {
      throw new ApplicationConflictError(
        "Only pending applications can be approved or denied.",
      );
    }

    if (input.status === "APPROVED") {
      const approvedCount = await tx.campaignApplication.count({
        where: { campaignId: input.campaignId, status: "APPROVED" },
      });
      if (approvedCount >= campaign.maxTesters) {
        throw new SeatsFullError();
      }
    }

    return tx.campaignApplication.update({
      where: { id: application.id },
      data: {
        status: input.status,
        resolvedAt: new Date(),
        resolvedById: input.resolverId,
      },
    });
  });
}

export function approveApplication(input: {
  readonly applicationId: string;
  readonly campaignId: string;
  readonly studioId: string;
  readonly resolverId: string;
}): Promise<CampaignApplication> {
  return resolveApplication({ ...input, status: "APPROVED" });
}

export function denyApplication(input: {
  readonly applicationId: string;
  readonly campaignId: string;
  readonly studioId: string;
  readonly resolverId: string;
}): Promise<CampaignApplication> {
  return resolveApplication({ ...input, status: "DENIED" });
}

/** Whether a tester is approved for a DOWNLOAD campaign (or N/A for others). */
export async function isApprovedForDownload(
  campaignId: string,
  testerId: string,
  tx: Prisma.TransactionClient | typeof db = db,
): Promise<boolean> {
  const row = await tx.campaignApplication.findUnique({
    where: {
      campaignId_testerId: { campaignId, testerId },
    },
    select: { status: true },
  });
  return row?.status === "APPROVED";
}

export async function getTesterApplicationStatus(
  campaignId: string,
  testerId: string,
): Promise<ApplicationStatus | null> {
  const row = await db.campaignApplication.findUnique({
    where: {
      campaignId_testerId: { campaignId, testerId },
    },
    select: { status: true },
  });
  return row?.status ?? null;
}
