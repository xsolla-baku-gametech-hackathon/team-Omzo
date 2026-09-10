import { NextResponse } from "next/server";

import {
  AccessConsumedError,
  AccessRevokedError,
  InvalidAccessTokenError,
  UaMismatchError,
  validateAccessGrant,
} from "@/server/services/accessService";

export async function GET(
  request: Request,
  props: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await props.params;
  const userAgent = request.headers.get("user-agent") ?? "Unknown";

  try {
    const { grant, campaign, payload } = await validateAccessGrant({
      token,
      userAgent,
    });

    return NextResponse.json({
      valid: true,
      grantId: grant.id,
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      buildKind: campaign.buildKind,
      buildUrl: campaign.buildUrl,
      watermarkId: payload.watermarkId,
      expiresAt: grant.expiresAt,
    });
  } catch (error) {
    if (error instanceof UaMismatchError) {
      return NextResponse.json(
        {
          error: "ua_mismatch",
          message: error.message,
        },
        { status: 403 },
      );
    }
    if (error instanceof AccessRevokedError) {
      return NextResponse.json(
        {
          error: "access_revoked",
          message: error.message,
        },
        { status: 410 },
      );
    }
    if (error instanceof AccessConsumedError) {
      return NextResponse.json(
        {
          error: "access_consumed",
          message: error.message,
        },
        { status: 410 },
      );
    }
    if (error instanceof InvalidAccessTokenError) {
      return NextResponse.json(
        {
          error: "invalid_token",
          message: error.message,
        },
        { status: 401 },
      );
    }

    console.error("[validateAccessGrant] failure", error);
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Failed to validate access token.",
      },
      { status: 500 },
    );
  }
}
