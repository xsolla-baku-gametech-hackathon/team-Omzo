import { NextResponse } from "next/server";
import { z } from "zod";

import { classifyBuildUrl } from "@/domain/campaigns/delivery";

import {
  createCampaign,
  getOpenCampaigns,
  getStudioCampaigns,
} from "@/server/services/campaignService";
import { getSession } from "@/server/session";

/**
 * A studio-supplied build URL becomes a redirect target on our own origin, so
 * it is validated before it is ever stored rather than at the moment it is
 * followed. Rejecting it here means no row can exist that the redirect route
 * would have to refuse later.
 */
const buildUrlSchema = z
  .string()
  .trim()
  .min(1, "Build URL is required")
  .max(500)
  .superRefine((value, ctx) => {
    const verdict = classifyBuildUrl(value);
    if (!verdict.safe) {
      ctx.addIssue({ code: "custom", message: verdict.reason });
    }
  });

const createCampaignSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters")
    .max(120),
  pitch: z.string().trim().min(1, "Pitch cannot be empty").max(1000),
  testFocus: z.string().trim().min(1, "Test focus cannot be empty").max(1000),
  buildKind: z.enum(["WEB_EMBED", "DOWNLOAD", "EXTERNAL_LINK"]),
  buildUrl: buildUrlSchema,
  ndaBodyMd: z.string().trim().min(1, "NDA text is required").max(10000),
  maxTesters: z.coerce.number().int().positive().default(200),
  rewardPoolTotal: z.coerce.number().int().nonnegative().default(0),
  rewardPerIssue: z.coerce.number().int().positive().default(50),
});

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  const session = await getSession();

  if (mode === "studio") {
    if (!session || session.role !== "STUDIO" || !session.studioId) {
      return NextResponse.json(
        { error: "unauthorized", message: "Studio authentication required." },
        { status: 401 },
      );
    }
    const campaigns = await getStudioCampaigns(session.studioId);
    return NextResponse.json({ campaigns });
  }

  // Public / tester listing
  const campaigns = await getOpenCampaigns();
  return NextResponse.json({ campaigns });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session || session.role !== "STUDIO" || !session.studioId) {
    return NextResponse.json(
      { error: "unauthorized", message: "Studio authentication required." },
      { status: 401 },
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

  const parsed = createCampaignSchema.safeParse(payload);
  if (!parsed.success) {
    const issuesSummary = parsed.error.issues
      .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
      .join("; ");
    return NextResponse.json(
      {
        error: "validation_error",
        message: issuesSummary || "Invalid campaign details.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  try {
    const campaign = await createCampaign({
      studioId: session.studioId,
      ...parsed.data,
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("[createCampaign] failed", error);
    return NextResponse.json(
      {
        error: "campaign_creation_failed",
        message: "Failed to create campaign.",
      },
      { status: 500 },
    );
  }
}
