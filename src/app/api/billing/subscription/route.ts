import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditEvent } from "@/server/security/auditLog";
import {
  UnknownPlanError,
  changeStudioPlan,
} from "@/server/services/billingService";
import { getSession } from "@/server/session";

/**
 * POST /api/billing/subscription — move this studio onto a plan.
 *
 * Scoped to the caller's own studio by construction: the studioId comes from
 * the session, never from the body, so there is no field here that could be
 * pointed at someone else's subscription.
 *
 * This records an intent. It takes no payment and does not claim to.
 */
const body = z.object({ planId: z.string().min(1).max(40) });

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session || session.role !== "STUDIO" || !session.studioId) {
    return NextResponse.json(
      { error: "unauthorized", message: "Sign in as a studio to change plan." },
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
      { error: "validation_error", message: "Pick a plan to move to." },
      { status: 422 },
    );
  }

  try {
    const result = await changeStudioPlan({
      studioId: session.studioId,
      actorId: session.sub,
      planId: parsed.data.planId,
    });

    if (result.changed) {
      recordAuditEvent("SUBSCRIPTION_CHANGED", session.sub, session.studioId, {
        from: result.from,
        to: result.to,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnknownPlanError) {
      // Also the answer for self-hosted, which is negotiated rather than
      // self-served. A button must not grant what nobody agreed to.
      return NextResponse.json(
        {
          error: "unavailable_plan",
          message: "That plan cannot be selected here. Talk to us instead.",
        },
        { status: 422 },
      );
    }

    console.error("[billing] plan change failed", error);
    return NextResponse.json(
      {
        error: "change_failed",
        message: "The plan did not change. Try again.",
      },
      { status: 500 },
    );
  }
}
