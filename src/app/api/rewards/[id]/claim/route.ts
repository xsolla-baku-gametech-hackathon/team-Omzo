import { NextResponse } from "next/server";

import { CLAIM_REFUSAL_MESSAGE } from "@/domain/rewards/catalogue";
import { rateLimit } from "@/server/security/rateLimiter";
import {
  ClaimRefusedError,
  RewardItemNotFoundError,
  claimReward,
} from "@/server/services/rewardClaimService";
import { getSession } from "@/server/session";

/**
 * POST /api/rewards/[id]/claim — a tester spends coins.
 *
 * The tester is the session, never the body. A client-supplied user id here
 * would let anyone drain anyone's balance into their own claim.
 */
export async function POST(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: rewardItemId } = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Sign in to claim a reward." },
      { status: 401 },
    );
  }

  // The claim itself is idempotent, so this is not what protects the balance.
  // It keeps a script from walking the whole shelf id by id.
  const limit = rateLimit(`claim:${session.sub}`, 20, 0.2);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        message: "Too many claims in a short period. Please wait a moment.",
        retryAfterSec: limit.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  try {
    const outcome = await claimReward({
      userId: session.sub,
      rewardItemId,
    });
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof ClaimRefusedError) {
      return NextResponse.json(
        {
          error: error.reason,
          message: CLAIM_REFUSAL_MESSAGE[error.reason],
        },
        { status: 409 },
      );
    }
    if (error instanceof RewardItemNotFoundError) {
      // Also the answer when the tester never joined this campaign: telling a
      // stranger the id is real confirms something they could not know.
      return NextResponse.json(
        { error: "not_found", message: "No such reward." },
        { status: 404 },
      );
    }

    console.error("[claimReward] unexpected failure", error);
    return NextResponse.json(
      { error: "claim_failed", message: "The claim could not be recorded." },
      { status: 500 },
    );
  }
}
