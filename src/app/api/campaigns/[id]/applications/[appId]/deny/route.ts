import { NextResponse } from "next/server";

import {
  ApplicationConflictError,
  ApplicationNotAllowedError,
  ApplicationNotFoundError,
  denyApplication,
} from "@/server/services/applicationService";
import { getSession } from "@/server/session";

export async function POST(
  _request: Request,
  props: { params: Promise<{ id: string; appId: string }> },
): Promise<NextResponse> {
  const { id: campaignId, appId } = await props.params;
  const session = await getSession();

  if (!session || session.role !== "STUDIO" || !session.studioId) {
    return NextResponse.json(
      { error: "unauthorized", message: "Studio authentication required." },
      { status: 401 },
    );
  }

  try {
    const application = await denyApplication({
      applicationId: appId,
      campaignId,
      studioId: session.studioId,
      resolverId: session.sub,
    });
    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      return NextResponse.json(
        { error: "not_found", message: error.message },
        { status: 404 },
      );
    }
    if (error instanceof ApplicationConflictError) {
      return NextResponse.json(
        { error: "conflict", message: error.message },
        { status: 409 },
      );
    }
    if (error instanceof ApplicationNotAllowedError) {
      return NextResponse.json(
        { error: "not_allowed", message: error.message },
        { status: 409 },
      );
    }
    console.error("[denyApplication] failed", error);
    return NextResponse.json(
      { error: "deny_failed", message: "Failed to deny application." },
      { status: 500 },
    );
  }
}
