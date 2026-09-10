import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createCampaign,
  getOpenCampaigns,
  getStudioCampaigns,
} from "@/server/services/campaignService";
import { getSession } from "@/server/session";

const createCampaignSchema = z.object({
  title: z.string().min(2).max(120),
  pitch: z.string().min(10).max(1000),
  testFocus: z.string().min(10).max(1000),
  buildKind: z.enum(["WEB_EMBED", "DOWNLOAD", "EXTERNAL_LINK"]),
  buildUrl: z.string().min(1).max(500),
  ndaBodyMd: z.string().min(20).max(10000),
  maxTesters: z.number().int().positive().default(200),
  rewardPoolTotal: z.number().int().nonnegative().default(0),
  rewardPerIssue: z.number().int().positive().default(50),
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
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Invalid campaign details.",
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
