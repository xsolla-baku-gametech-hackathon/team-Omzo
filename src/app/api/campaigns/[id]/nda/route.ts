import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CampaignNotOpenForSigningError,
  InvalidTypedNameError,
  MissingBirthDateError,
  UnderageError,
  getNdaSignature,
  signNda,
} from "@/server/services/ndaService";
import { getSession } from "@/server/session";

const signNdaSchema = z.object({
  typedName: z.string().min(2).max(120),
});

export async function GET(
  _request: Request,
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

  const signature = await getNdaSignature(session.sub, campaignId);
  return NextResponse.json({
    signed: signature !== null,
    signature,
  });
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = signNdaSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: "A full typed name is required to sign.",
        issues: parsed.error.issues,
      },
      { status: 422 },
    );
  }

  const userAgent = request.headers.get("user-agent") ?? "Unknown";
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1";

  try {
    const signature = await signNda({
      userId: session.sub,
      campaignId,
      typedName: parsed.data.typedName,
      userAgent,
      clientIp,
    });

    return NextResponse.json({ success: true, signature }, { status: 201 });
  } catch (error) {
    if (error instanceof UnderageError) {
      return NextResponse.json(
        { error: "underage", message: error.message },
        { status: 403 },
      );
    }
    if (error instanceof MissingBirthDateError) {
      return NextResponse.json(
        { error: "missing_birth_date", message: error.message },
        { status: 400 },
      );
    }
    if (error instanceof CampaignNotOpenForSigningError) {
      return NextResponse.json(
        { error: "campaign_not_open", message: error.message },
        { status: 409 },
      );
    }
    if (error instanceof InvalidTypedNameError) {
      return NextResponse.json(
        { error: "invalid_name", message: error.message },
        { status: 422 },
      );
    }

    console.error("[signNda] unexpected failure", error);
    return NextResponse.json(
      { error: "nda_sign_failed", message: "Failed to record NDA signature." },
      { status: 500 },
    );
  }
}
