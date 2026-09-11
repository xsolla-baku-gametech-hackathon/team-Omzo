import { NextResponse } from "next/server";
import { z } from "zod";

import { REWARD_KINDS } from "@/domain/rewards/catalogue";
import {
  UnauthorizedCampaignAccessError,
  CampaignNotFoundError,
} from "@/server/services/campaignService";
import { createRewardItem } from "@/server/services/rewardClaimService";
import { getSession } from "@/server/session";

const body = z.object({
  kind: z.enum(REWARD_KINDS as unknown as [string, ...string[]]),
  label: z.string().trim().min(1, "A label is required").max(120),
  costCoins: z.coerce.number().int().positive().max(1_000_000),
  totalStock: z.coerce.number().int().positive().max(10_000),
});

export async function POST(
  request: Request,
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_reward",
        message: "The reward did not match the expected shape.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  try {
    const item = await createRewardItem({
      campaignId,
      studioId: session.studioId,
      kind: parsed.data.kind as (typeof REWARD_KINDS)[number],
      label: parsed.data.label,
      costCoins: parsed.data.costCoins,
      totalStock: parsed.data.totalStock,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (
      error instanceof UnauthorizedCampaignAccessError ||
      error instanceof CampaignNotFoundError
    ) {
      return NextResponse.json(
        { error: "not_found", message: "No such campaign." },
        { status: 404 },
      );
    }
    console.error("[createRewardItem] failure", error);
    return NextResponse.json(
      { error: "create_failed", message: "The reward could not be saved." },
      { status: 500 },
    );
  }
}
