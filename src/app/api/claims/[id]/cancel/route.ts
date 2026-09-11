import { NextResponse } from "next/server";

import {
  ClaimNotFoundError,
  ClaimNotOpenError,
  cancelClaim,
} from "@/server/services/rewardClaimService";
import { getSession } from "@/server/session";

/**
 * The studio cannot supply this one. Refunds the coins and returns the unit
 * to stock; the claim row stays so the item cannot be re-taken.
 */
export async function POST(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: claimId } = await props.params;
  const session = await getSession();
  if (!session || session.role !== "STUDIO" || !session.studioId) {
    return NextResponse.json(
      { error: "unauthorized", message: "Studio authentication required." },
      { status: 401 },
    );
  }

  try {
    await cancelClaim({ claimId, studioId: session.studioId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ClaimNotOpenError) {
      return NextResponse.json(
        { error: "claim_not_open", message: error.message },
        { status: 409 },
      );
    }
    if (error instanceof ClaimNotFoundError) {
      return NextResponse.json(
        { error: "not_found", message: "No such claim." },
        { status: 404 },
      );
    }
    console.error("[cancelClaim] failure", error);
    return NextResponse.json(
      { error: "not_found", message: "No such claim." },
      { status: 404 },
    );
  }
}
