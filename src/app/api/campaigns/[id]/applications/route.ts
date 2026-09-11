import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ApplicationConflictError,
  ApplicationNotAllowedError,
  ApplicationNotFoundError,
  SeatsFullError,
  applyToCampaign,
  listCampaignApplications,
} from "@/server/services/applicationService";
import { getSession } from "@/server/session";

const applySchema = z.object({
  message: z.string().trim().max(500).optional(),
});

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: campaignId } = await props.params;
  const session = await getSession();

  if (!session || session.role !== "STUDIO" || !session.studioId) {
    return NextResponse.json(
      { error: "unauthorized", message: "Studio authentication required." },
      { status: 401 },
    );
  }

  try {
    const applications = await listCampaignApplications(
      campaignId,
      session.studioId,
    );
    return NextResponse.json({ applications });
  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      return NextResponse.json(
        { error: "not_found", message: "Campaign not found." },
        { status: 404 },
      );
    }
    console.error("[listApplications] failed", error);
    return NextResponse.json(
      { error: "list_failed", message: "Failed to list applications." },
      { status: 500 },
    );
  }
}

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

  if (session.role !== "TESTER") {
    return NextResponse.json(
      {
        error: "forbidden",
        message: "Only testers can apply to download campaigns.",
      },
      { status: 403 },
    );
  }

  let payload: unknown = {};
  try {
    const text = await request.text();
    if (text) payload = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = applySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const application = await applyToCampaign({
      campaignId,
      testerId: session.sub,
      message: parsed.data.message,
    });
    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    if (error instanceof ApplicationNotAllowedError) {
      return NextResponse.json(
        { error: "not_allowed", message: error.message },
        { status: 409 },
      );
    }
    if (error instanceof ApplicationConflictError) {
      return NextResponse.json(
        { error: "conflict", message: error.message },
        { status: 409 },
      );
    }
    if (error instanceof SeatsFullError) {
      return NextResponse.json(
        { error: "seats_full", message: error.message },
        { status: 409 },
      );
    }
    console.error("[applyToCampaign] failed", error);
    return NextResponse.json(
      { error: "apply_failed", message: "Failed to submit application." },
      { status: 500 },
    );
  }
}
