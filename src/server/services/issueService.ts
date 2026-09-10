import { db } from "@/server/db";
import { campaignEvents } from "@/server/events";
import type { Issue, Report, Severity } from "@prisma/client";

/**
 * Issue queries and shared-traits synthesis (SPEC.md §5.5, §8).
 *
 * Rules:
 * - Sort order: severity (CRITICAL > HIGH > MEDIUM > LOW) then occurrenceCount desc
 * - Shared traits stated as a sentence, not a chart:
 *   "16 of 18 occurrences on AMD GPUs. 17 of 18 in Chrome. All within 4 units of (128, 0, 96)."
 */

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export interface SynthesizedTraits {
  readonly sentence: string;
  readonly topGpu?: { name: string; count: number; total: number };
  readonly topBrowser?: { name: string; count: number; total: number };
  readonly scene?: string;
}

export interface IssueWithReports extends Issue {
  readonly reports: readonly Report[];
  readonly synthesizedTraits: SynthesizedTraits;
}

export class IssueNotFoundError extends Error {
  constructor(issueId: string) {
    super(`Issue ${issueId} was not found.`);
    this.name = "IssueNotFoundError";
  }
}

export class UnauthorizedIssueMutationError extends Error {
  constructor() {
    super("You do not have permission to verify or modify this issue.");
    this.name = "UnauthorizedIssueMutationError";
  }
}

/**
 * Synthesizes shared hardware, environment, and spatial traits into a sentence (§8).
 */
export function synthesizeSharedTraits(
  issue: { occurrenceCount: number },
  reports: readonly {
    systemInfo: unknown;
    gameState: unknown;
  }[],
): SynthesizedTraits {
  const total = reports.length;
  if (total === 0) {
    return { sentence: "No occurrence data available." };
  }

  // Count GPUs and Browsers
  const gpus = new Map<string, number>();
  const browsers = new Map<string, number>();
  const scenes = new Map<string, number>();
  const coords: { x: number; y: number; z: number }[] = [];

  for (const r of reports) {
    const sys = (r.systemInfo ?? {}) as Record<string, unknown>;
    const game = (r.gameState ?? {}) as Record<string, unknown>;

    const gpu = typeof sys.gpuRenderer === "string" ? sys.gpuRenderer : "";
    const browser = typeof sys.browser === "string" ? sys.browser : "";
    const scene = typeof game.scene === "string" ? game.scene : "";

    // Group GPU into families
    let gpuFamily = "Other";
    if (/nvidia|geforce/i.test(gpu)) gpuFamily = "NVIDIA";
    else if (/amd|radeon/i.test(gpu)) gpuFamily = "AMD";
    else if (/intel/i.test(gpu)) gpuFamily = "Intel";
    else if (/apple/i.test(gpu)) gpuFamily = "Apple";

    gpus.set(gpuFamily, (gpus.get(gpuFamily) ?? 0) + 1);

    // Group browser
    let browserFamily = "Browser";
    if (/chrome/i.test(browser)) browserFamily = "Chrome";
    else if (/firefox/i.test(browser)) browserFamily = "Firefox";
    else if (/safari/i.test(browser)) browserFamily = "Safari";
    else if (/edge/i.test(browser)) browserFamily = "Edge";

    browsers.set(browserFamily, (browsers.get(browserFamily) ?? 0) + 1);

    if (scene) {
      scenes.set(scene, (scenes.get(scene) ?? 0) + 1);
    }

    if (
      typeof game.x === "number" &&
      typeof game.y === "number" &&
      typeof game.z === "number"
    ) {
      coords.push({ x: game.x, y: game.y, z: game.z });
    }
  }

  const parts: string[] = [];

  // Top GPU
  const [topGpuName, topGpuCount] = [...gpus.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0] ?? ["", 0];
  let topGpu: { name: string; count: number; total: number } | undefined;
  if (topGpuCount > 0) {
    topGpu = { name: topGpuName, count: topGpuCount, total };
    if (topGpuCount / total >= 0.6) {
      parts.push(
        `${topGpuCount} of ${total} occurrences on ${topGpuName} GPUs`,
      );
    }
  }

  // Top Browser
  const [topBrowserName, topBrowserCount] = [...browsers.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0] ?? ["", 0];
  let topBrowser: { name: string; count: number; total: number } | undefined;
  if (topBrowserCount > 0) {
    topBrowser = { name: topBrowserName, count: topBrowserCount, total };
    if (topBrowserCount / total >= 0.6) {
      parts.push(`${topBrowserCount} of ${total} in ${topBrowserName}`);
    }
  }

  // Top Scene & coordinates
  const [topSceneName, topSceneCount] = [...scenes.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0] ?? ["", 0];
  if (coords.length > 0 && topSceneCount > 0) {
    // Mean coordinates
    const meanX = Math.round(
      coords.reduce((s, c) => s + c.x, 0) / coords.length,
    );
    const meanY = Math.round(
      coords.reduce((s, c) => s + c.y, 0) / coords.length,
    );
    const meanZ = Math.round(
      coords.reduce((s, c) => s + c.z, 0) / coords.length,
    );

    // Max distance from mean
    const maxDist = Math.max(
      ...coords.map((c) =>
        Math.sqrt((c.x - meanX) ** 2 + (c.y - meanY) ** 2 + (c.z - meanZ) ** 2),
      ),
    );
    const radius = Math.ceil(maxDist);

    if (topSceneCount === total) {
      parts.push(
        `All in ${topSceneName} within ${radius === 0 ? 1 : radius} units of (${meanX}, ${meanY}, ${meanZ})`,
      );
    } else {
      parts.push(
        `${topSceneCount} of ${total} in ${topSceneName} near (${meanX}, ${meanY}, ${meanZ})`,
      );
    }
  }

  const sentence =
    parts.length > 0
      ? `${parts.join(". ")}.`
      : `Observed across ${total} occurrences with varied system environments.`;

  return {
    sentence,
    topGpu,
    topBrowser,
    scene: topSceneName || undefined,
  };
}

/**
 * Fetches all issues for a campaign, sorted by severity then occurrenceCount desc.
 */
export async function getCampaignIssues(
  campaignId: string,
): Promise<readonly Issue[]> {
  const issues = await db.issue.findMany({
    where: { campaignId },
  });

  return [...issues].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.occurrenceCount - a.occurrenceCount;
  });
}

/**
 * Fetches the recent raw incoming reports stream for a campaign.
 */
export async function getCampaignReportsStream(
  campaignId: string,
  limit: number = 40,
): Promise<readonly Report[]> {
  return db.report.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Fetches single issue detail, attached occurrences, and screenshots.
 */
export async function getIssueDetail(
  issueId: string,
): Promise<IssueWithReports> {
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    include: {
      reports: {
        orderBy: { createdAt: "desc" },
        include: {
          reporter: { select: { displayName: true } },
        },
      },
    },
  });

  if (issue === null) {
    throw new IssueNotFoundError(issueId);
  }

  const synthesizedTraits = synthesizeSharedTraits(issue, issue.reports);

  return {
    ...issue,
    synthesizedTraits,
  };
}

/**
 * Verifies an issue, marking status = VERIFIED and emitting realtime events.
 */
export async function verifyIssue(
  issueId: string,
  studioId?: string,
): Promise<Issue> {
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    include: { campaign: { select: { studioId: true } } },
  });

  if (issue === null) {
    throw new IssueNotFoundError(issueId);
  }

  if (studioId && issue.campaign.studioId !== studioId) {
    throw new UnauthorizedIssueMutationError();
  }

  const updated = await db.issue.update({
    where: { id: issueId },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date(),
    },
  });

  campaignEvents.emit({
    type: "issue_verified",
    payload: {
      campaignId: updated.campaignId,
      issueId: updated.id,
      verifiedAt: updated.verifiedAt
        ? updated.verifiedAt.toISOString()
        : new Date().toISOString(),
    },
  });

  campaignEvents.emit({
    type: "issue_updated",
    payload: {
      campaignId: updated.campaignId,
      issueId: updated.id,
      title: updated.title,
      category: updated.category,
      severity: updated.severity,
      occurrenceCount: updated.occurrenceCount,
      status: updated.status,
    },
  });

  return updated;
}
