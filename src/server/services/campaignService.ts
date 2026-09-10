import { db } from "@/server/db";
import type { BuildKind, Campaign, CampaignStatus } from "@prisma/client";

/**
 * Campaign service with strict studio tenant isolation (SPEC.md §1, §6.5).
 *
 * Rules:
 * - Authorisation is checked in the service layer, not only in the UI
 * - A studio cannot read, update, or revoke another studio's campaign
 * - Setting revokedAt invalidates all live grants immediately
 */

export interface CreateCampaignInput {
  readonly studioId: string;
  readonly title: string;
  readonly pitch: string;
  readonly testFocus: string;
  readonly buildKind: BuildKind;
  readonly buildUrl: string;
  readonly ndaBodyMd: string;
  readonly maxTesters?: number;
  readonly rewardPoolTotal?: number;
  readonly rewardPerIssue?: number;
}

export interface UpdateCampaignInput {
  readonly campaignId: string;
  readonly studioId: string;
  readonly title?: string;
  readonly pitch?: string;
  readonly testFocus?: string;
  readonly buildKind?: BuildKind;
  readonly buildUrl?: string;
  readonly ndaBodyMd?: string;
  readonly maxTesters?: number;
  readonly status?: CampaignStatus;
}

export class CampaignNotFoundError extends Error {
  constructor(campaignId: string) {
    super(`Campaign ${campaignId} was not found.`);
    this.name = "CampaignNotFoundError";
  }
}

export class UnauthorizedCampaignAccessError extends Error {
  constructor() {
    super("You do not have permission to access or modify this campaign.");
    this.name = "UnauthorizedCampaignAccessError";
  }
}

/**
 * Creates a new campaign under the authenticated studio.
 */
export async function createCampaign(
  input: CreateCampaignInput,
): Promise<Campaign> {
  return db.campaign.create({
    data: {
      studioId: input.studioId,
      title: input.title.trim(),
      pitch: input.pitch.trim(),
      testFocus: input.testFocus.trim(),
      buildKind: input.buildKind,
      buildUrl: input.buildUrl.trim(),
      ndaBodyMd: input.ndaBodyMd.trim(),
      maxTesters: input.maxTesters ?? 200,
      rewardPoolTotal: input.rewardPoolTotal ?? 0,
      rewardPerIssue: input.rewardPerIssue ?? 50,
      status: "OPEN",
    },
  });
}

/**
 * Lists all campaigns owned by the given studio.
 */
export async function getStudioCampaigns(
  studioId: string,
): Promise<readonly Campaign[]> {
  return db.campaign.findMany({
    where: { studioId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          reports: true,
          issues: true,
          accessGrants: true,
        },
      },
    },
  });
}

/**
 * Gets a single campaign owned by the studio, asserting tenant boundary.
 */
export async function getStudioCampaign(
  campaignId: string,
  studioId: string,
): Promise<Campaign> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: {
      _count: {
        select: {
          reports: true,
          issues: true,
          accessGrants: true,
        },
      },
    },
  });

  if (campaign === null) {
    throw new CampaignNotFoundError(campaignId);
  }

  if (campaign.studioId !== studioId) {
    throw new UnauthorizedCampaignAccessError();
  }

  return campaign;
}

/**
 * Updates a campaign's settings or status, asserting tenant boundary.
 */
export async function updateCampaign(
  input: UpdateCampaignInput,
): Promise<Campaign> {
  await getStudioCampaign(input.campaignId, input.studioId);

  return db.campaign.update({
    where: { id: input.campaignId },
    data: {
      title: input.title?.trim(),
      pitch: input.pitch?.trim(),
      testFocus: input.testFocus?.trim(),
      buildKind: input.buildKind,
      buildUrl: input.buildUrl?.trim(),
      ndaBodyMd: input.ndaBodyMd?.trim(),
      maxTesters: input.maxTesters,
      status: input.status,
    },
  });
}

/**
 * Revokes a campaign immediately (§6.1).
 *
 * Setting revokedAt invalidates every live grant for this campaign at once
 * by construction, without needing a background sweep over grant rows.
 */
export async function revokeCampaign(
  campaignId: string,
  studioId: string,
): Promise<Campaign> {
  await getStudioCampaign(campaignId, studioId);

  return db.campaign.update({
    where: { id: campaignId },
    data: { revokedAt: new Date() },
  });
}

/**
 * Lists open campaigns visible to testers.
 */
export async function getOpenCampaigns(): Promise<readonly Campaign[]> {
  return db.campaign.findMany({
    where: {
      status: "OPEN",
      revokedAt: null,
    },
    orderBy: { createdAt: "desc" },
    include: {
      studio: { select: { name: true } },
      _count: { select: { reports: true } },
    },
  });
}

/**
 * Gets campaign details for a tester view.
 */
export async function getCampaignForTester(
  campaignId: string,
): Promise<Campaign> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: {
      studio: { select: { name: true } },
    },
  });

  if (
    campaign === null ||
    campaign.status !== "OPEN" ||
    campaign.revokedAt !== null
  ) {
    throw new CampaignNotFoundError(campaignId);
  }

  return campaign;
}
