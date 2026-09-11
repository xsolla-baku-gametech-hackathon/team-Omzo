import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateIngest, mayReportTo } from "@/server/auth/ingestAuth";
import { rateLimit } from "@/server/security/rateLimiter";
import {
  CampaignNotOpenError,
  ingestReport,
} from "@/server/services/ingestService";

/**
 * POST /api/ingest — the only way a report enters the system.
 *
 * The seed script posts through here too, rather than writing rows directly.
 * That is deliberate: a seed that bypasses the endpoint would prove the
 * database works and nothing else, and the demo's numbers would come from a
 * path no real report ever takes.
 */

/** 2 MB after the overlay's own downscale and JPEG pass (§7). */
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;

const gameState = z.object({
  scene: z.string().min(1).max(120),
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  playtimeSec: z.number().finite().nonnegative(),
});

const systemInfo = z.object({
  os: z.string().max(200),
  browser: z.string().max(200),
  gpuRenderer: z.string().max(300),
  screen: z.string().max(60),
  memoryGb: z.number().finite().positive().optional(),
});

const ingestBody = z.object({
  // No reporterId. The reporter is whoever the credential says it is; a
  // client-supplied one is an impersonation primitive, not an input.
  campaignId: z.string().min(1),
  body: z.string().min(1).max(4000),
  gameState,
  systemInfo,
  consoleTail: z.array(z.string().max(2000)).max(50).default([]),
  screenshotData: z
    .string()
    .max(MAX_SCREENSHOT_BYTES)
    .refine((value) => value.startsWith("data:image/"), {
      message: "screenshotData must be an image data URL",
    })
    .optional(),
  clientReportId: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const principal = await authenticateIngest(request);
  if (principal === null) {
    return NextResponse.json(
      {
        error: "unauthenticated",
        message:
          "This report needs a valid session or build access token. Open the campaign from your access link and try again.",
      },
      { status: 401 },
    );
  }

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1";

  // Keyed on the authenticated user as well as the address: one tester
  // behind a shared NAT should not exhaust everyone else's budget, and one
  // user rotating addresses should not get a fresh budget each time.
  const limitCheck = rateLimit(
    `ingest:${principal.userId}:${clientIp}`,
    60,
    1.0,
  );
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        message:
          "Too many bug reports filed in a short period. Please wait a moment.",
        retryAfterSec: limitCheck.retryAfterSec,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limitCheck.retryAfterSec),
        },
      },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = ingestBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_report",
        message: "The report did not match the expected shape.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  // A grant token pins its own campaign; a session cookie does not, so a
  // session caller has to be someone this campaign actually admitted.
  const campaignId = principal.campaignId ?? parsed.data.campaignId;
  if (!(await mayReportTo(principal, campaignId))) {
    return NextResponse.json(
      {
        error: "not_found",
        message: "No such campaign.",
      },
      { status: 404 },
    );
  }

  try {
    const outcome = await ingestReport({
      ...parsed.data,
      campaignId,
      reporterId: principal.userId,
    });
    return NextResponse.json(outcome, {
      status: outcome.deduplicated ? 200 : 201,
    });
  } catch (error) {
    if (error instanceof CampaignNotOpenError) {
      return NextResponse.json(
        {
          error: "campaign_not_open",
          message: "This campaign is not accepting reports.",
        },
        { status: 409 },
      );
    }

    // Never echo a raw exception to the client (§6.5). The server log keeps
    // the detail; the caller gets something true and useless to an attacker.
    console.error("[ingest] unexpected failure", error);
    return NextResponse.json(
      {
        error: "ingest_failed",
        message: "The report could not be recorded. Please try again.",
      },
      { status: 500 },
    );
  }
}
