import { NextResponse } from "next/server";

import {
  AccessRateLimitExceededError,
  CampaignNotAvailableError,
  NdaRequiredError,
  issueAccessGrant,
} from "@/server/services/accessService";
import { getSession } from "@/server/session";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: campaignId } = await props.params;
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "unauthorized", message: "Authentication required." },
      { status: 401 },
    );
  }

  const userAgent = request.headers.get("user-agent") ?? "Unknown";

  try {
    const { grant, token } = await issueAccessGrant({
      userId: session.sub,
      campaignId,
      userAgent,
    });

    const accessUrl = `/play/${campaignId}/session?token=${token}`;

    return NextResponse.json(
      {
        success: true,
        token,
        accessUrl,
        expiresAt: grant.expiresAt,
        watermarkId: grant.watermarkId,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof NdaRequiredError) {
      return NextResponse.json(
        { error: "nda_required", message: error.message },
        { status: 403 },
      );
    }
    if (error instanceof CampaignNotAvailableError) {
      return NextResponse.json(
        { error: "campaign_not_available", message: error.message },
        { status: 409 },
      );
    }
    if (error instanceof AccessRateLimitExceededError) {
      return NextResponse.json(
        { error: "rate_limited", message: error.message },
        { status: 429 },
      );
    }

    console.error("[issueAccessGrant] unexpected failure", error);
    return NextResponse.json(
      {
        error: "access_grant_failed",
        message: "Failed to issue access grant.",
      },
      { status: 500 },
    );
  }
}
