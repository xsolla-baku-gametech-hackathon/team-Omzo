import { NextResponse } from "next/server";

import { classifyBuildUrl, deliveryModeOf } from "@/domain/campaigns/delivery";
import { recordAccessEvent } from "@/server/services/accessLog";
import {
  AccessConsumedError,
  AccessDeniedError,
  AccessRevokedError,
  UaMismatchError,
  validateAccessGrant,
} from "@/server/services/accessService";

/**
 * GET /api/access/[token]/build — the gated door to a build we do not host.
 *
 * The point of link-only delivery is that the studio keeps its binary. The
 * point of routing the tester through here anyway is that everything else
 * still applies: the grant has to be live, bound to this browser, and belong
 * to someone who signed the NDA — and the attempt is recorded either way.
 * Without this the studio's URL would be an unguarded link we merely emailed.
 *
 * This is also where a DOWNLOAD grant is spent. Handing over the build is the
 * use; validating a token to render a page is not.
 */

function clientIpOf(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1"
  );
}

export async function GET(
  request: Request,
  props: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await props.params;
  const userAgent = request.headers.get("user-agent") ?? "Unknown";
  const clientIp = clientIpOf(request);

  try {
    const { grant, campaign } = await validateAccessGrant({
      token,
      userAgent,
      consume: true,
    });

    if (campaign.buildKind === "WEB_EMBED") {
      // Nothing to redirect to: we render this one ourselves, watermarked.
      // Sending the tester to the embed URL would skip the frame that carries
      // their identity, which is the entire reason we host it.
      return NextResponse.json(
        {
          error: "not_a_redirect_target",
          message:
            "This build runs inside Repro. Open it from your session link.",
        },
        { status: 409 },
      );
    }

    const verdict = classifyBuildUrl(campaign.buildUrl);
    if (!verdict.safe) {
      // Stored before the URL rules existed, or edited around them. Refusing
      // here means an old row cannot turn this route into an open redirect.
      console.error(
        `[access] campaign ${campaign.id} has an unsafe buildUrl: ${verdict.reason}`,
      );
      return NextResponse.json(
        {
          error: "unsafe_build_url",
          message:
            "This campaign's build link is not valid. Ask the studio to update it.",
        },
        { status: 409 },
      );
    }

    await recordAccessEvent({
      campaignId: campaign.id,
      userId: grant.userId,
      grantId: grant.id,
      outcome: "GRANTED",
      buildKind: campaign.buildKind,
      userAgent,
      clientIp,
    });

    // An internal path is a build we serve ourselves and must be resolved
    // against this request's origin — NextResponse.redirect rejects a
    // relative URL, so passing one straight through would 500 on a campaign
    // that is otherwise perfectly valid.
    const destination =
      verdict.scope === "internal"
        ? new URL(campaign.buildUrl, request.url).toString()
        : campaign.buildUrl;

    const response = NextResponse.redirect(destination, 302);
    // The destination is behind a 15-minute grant and, for downloads, single
    // use. A cached 302 would outlive both.
    response.headers.set("Cache-Control", "no-store");
    response.headers.set(
      "X-Repro-Delivery-Mode",
      deliveryModeOf(campaign.buildKind),
    );
    return response;
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      if (error.context !== null) {
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

      const status =
        error instanceof UaMismatchError
          ? 403
          : error instanceof AccessRevokedError ||
              error instanceof AccessConsumedError
            ? 410
            : 401;

      return NextResponse.json(
        { error: error.name, message: error.message },
        { status },
      );
    }

    console.error("[access] build redirect failed", error);
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Failed to validate access token.",
      },
      { status: 500 },
    );
  }
}
