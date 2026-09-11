import { NextResponse } from "next/server";

import { recordAccessEvent } from "@/server/services/accessLog";
import {
  AccessConsumedError,
  AccessDeniedError,
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
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1";

  try {
    // Deliberately does not consume. This call exists to render the session
    // surface; spending a single-use download grant here would burn it before
    // the tester had the build.
    const { grant, campaign, payload } = await validateAccessGrant({
      token,
      userAgent,
    });

    await recordAccessEvent({
      campaignId: campaign.id,
      userId: grant.userId,
      grantId: grant.id,
      outcome: "GRANTED",
      buildKind: campaign.buildKind,
      userAgent,
      clientIp,
    });

    return NextResponse.json({
      valid: true,
      grantId: grant.id,
      userId: payload.userId,
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      buildKind: campaign.buildKind,
      // The build URL itself is deliberately not returned. Every route to the
      // build now goes through the gated redirect, so there is one place that
      // records the access rather than a URL the client can keep and reuse.
      watermarkId: payload.watermarkId,
      expiresAt: grant.expiresAt,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError && error.context !== null) {
      await recordAccessEvent({
        campaignId: error.context.campaignId,
        userId: error.context.userId,
        grantId: error.context.grantId,
        outcome: error.outcome,
        buildKind: error.context.buildKind,
        userAgent,
        clientIp,
      });
    }

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
