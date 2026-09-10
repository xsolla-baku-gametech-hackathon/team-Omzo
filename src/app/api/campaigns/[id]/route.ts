import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CampaignNotFoundError,
  UnauthorizedCampaignAccessError,
  getCampaignForTester,
  getStudioCampaign,
  revokeCampaign,
  updateCampaign,
} from "@/server/services/campaignService";
import { getSession } from "@/server/session";

const updateSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  pitch: z.string().min(10).max(1000).optional(),
  testFocus: z.string().min(10).max(1000).optional(),
  buildKind: z.enum(["WEB_EMBED", "DOWNLOAD", "EXTERNAL_LINK"]).optional(),
  buildUrl: z.string().min(1).max(500).optional(),
  ndaBodyMd: z.string().min(20).max(10000).optional(),
  maxTesters: z.number().int().positive().optional(),
  status: z.enum(["DRAFT", "OPEN", "CLOSED"]).optional(),
});

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await props.params;
  const session = await getSession();

  try {
    if (session?.role === "STUDIO" && session.studioId) {
      try {
        const campaign = await getStudioCampaign(id, session.studioId);
        return NextResponse.json({ campaign, isOwner: true });
      } catch (err) {
        if (err instanceof CampaignNotFoundError) throw err;
        // Not owner, fall through to public/tester view
      }
    }

    const campaign = await getCampaignForTester(id);
    return NextResponse.json({ campaign, isOwner: false });
  } catch (error) {
    if (error instanceof CampaignNotFoundError) {
      return NextResponse.json(
        { error: "not_found", message: "Campaign not found." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "server_error", message: "Internal server error." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await props.params;
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

  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const campaign = await updateCampaign({
      campaignId: id,
      studioId: session.studioId,
      ...parsed.data,
    });
    return NextResponse.json({ campaign });
  } catch (error) {
    if (error instanceof UnauthorizedCampaignAccessError) {
      return NextResponse.json(
        { error: "forbidden", message: error.message },
        { status: 403 },
      );
    }
    if (error instanceof CampaignNotFoundError) {
      return NextResponse.json(
        { error: "not_found", message: error.message },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "update_failed", message: "Failed to update campaign." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await props.params;
  const session = await getSession();
  if (!session || session.role !== "STUDIO" || !session.studioId) {
    return NextResponse.json(
      { error: "unauthorized", message: "Studio authentication required." },
      { status: 401 },
    );
  }

  try {
    const campaign = await revokeCampaign(id, session.studioId);
    return NextResponse.json({ campaign, revoked: true });
  } catch (error) {
    if (error instanceof UnauthorizedCampaignAccessError) {
      return NextResponse.json(
        { error: "forbidden", message: error.message },
        { status: 403 },
      );
    }
    if (error instanceof CampaignNotFoundError) {
      return NextResponse.json(
        { error: "not_found", message: error.message },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "revoke_failed", message: "Failed to revoke campaign." },
      { status: 500 },
    );
  }
}
