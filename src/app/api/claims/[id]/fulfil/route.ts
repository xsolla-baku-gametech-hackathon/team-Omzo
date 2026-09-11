import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ClaimNotFoundError,
  ClaimNotOpenError,
  fulfilClaim,
} from "@/server/services/rewardClaimService";
import { getSession } from "@/server/session";

const body = z.object({
  // The studio pastes a code it already owns. We never generate one, and we
  // never hold a key inventory.
  code: z.string().trim().min(1, "A code is required").max(200),
});

export async function POST(
  request: Request,
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
        error: "invalid_code",
        message: parsed.error.issues[0]?.message ?? "A code is required.",
      },
      { status: 422 },
    );
  }

  try {
    await fulfilClaim({
      claimId,
      studioId: session.studioId,
      code: parsed.data.code,
    });
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
    // A claim on another studio's campaign throws the tenancy error, which is
    // answered as 404 for the same reason every other route does.
    console.error("[fulfilClaim] failure", error);
    return NextResponse.json(
      { error: "not_found", message: "No such claim." },
      { status: 404 },
    );
  }
}
