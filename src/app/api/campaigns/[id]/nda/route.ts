import { NextResponse } from "next/server";
import { z } from "zod";

import {
  parseBirthDateInput,
  validateAdultAge,
  validateLegalName,
} from "@/domain/access/identityRules";
import {
  ApprovalRequiredForNdaError,
  CampaignNotOpenForSigningError,
  InvalidTypedNameError,
  MissingBirthDateError,
  RedistributionAckRequiredError,
  UnderageError,
  getNdaSignature,
  signNda,
} from "@/server/services/ndaService";
import { getSession } from "@/server/session";
import { db } from "@/server/db";
import { effectiveNdaBody } from "@/domain/campaigns/leakRider";

const signNdaSchema = z.object({
  typedName: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .refine((name) => validateLegalName(name).valid, {
      message: "Enter both your first and last name (e.g. Alex Chen).",
    }),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD."),
  attestedHuman: z.boolean().refine((value) => value === true, {
    message: "Human attestation is required.",
  }),
  agreedToTerms: z.boolean().refine((value) => value === true, {
    message: "You must accept the confidentiality terms.",
  }),
  acceptedNoRedistribution: z.boolean().optional(),
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

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      title: true,
      ndaBodyMd: true,
      buildKind: true,
      status: true,
      revokedAt: true,
    },
  });

  if (
    campaign === null ||
    campaign.status !== "OPEN" ||
    campaign.revokedAt !== null
  ) {
    return NextResponse.json(
      { error: "not_found", message: "Campaign not found." },
      { status: 404 },
    );
  }

  const signature = await getNdaSignature(session.sub, campaignId);
  return NextResponse.json({
    signed: signature !== null,
    signature,
    buildKind: campaign.buildKind,
    ndaBodyMd: effectiveNdaBody(campaign.ndaBodyMd, campaign.buildKind),
    requiresRedistributionAck: campaign.buildKind === "DOWNLOAD",
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
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      {
        error: "validation_error",
        message:
          firstIssue ||
          "A full typed name, adult date of birth, and attestations are required.",
        issues: parsed.error.issues,
      },
      { status: 422 },
    );
  }

  const birthDate = parseBirthDateInput(parsed.data.birthDate);
  const ageCheck = validateAdultAge(birthDate);
  if (!ageCheck.valid || birthDate == null) {
    return NextResponse.json(
      {
        error: "underage",
        message:
          ageCheck.reason ??
          "You must be at least 18 years old to sign an NDA.",
      },
      { status: 403 },
    );
  }

  const nameCheck = validateLegalName(parsed.data.typedName);
  if (!nameCheck.valid) {
    return NextResponse.json(
      {
        error: "invalid_name",
        message: nameCheck.reason ?? "Invalid legal name.",
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
    await db.user.update({
      where: { id: session.sub },
      data: { birthDate },
    });

    const signature = await signNda({
      userId: session.sub,
      campaignId,
      typedName: parsed.data.typedName,
      userAgent,
      clientIp,
      acceptedNoRedistribution: parsed.data.acceptedNoRedistribution,
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
    if (error instanceof RedistributionAckRequiredError) {
      return NextResponse.json(
        { error: "redistribution_ack_required", message: error.message },
        { status: 422 },
      );
    }
    if (error instanceof ApprovalRequiredForNdaError) {
      return NextResponse.json(
        { error: "approval_required", message: error.message },
        { status: 403 },
      );
    }

    console.error("[signNda] unexpected failure", error);
    return NextResponse.json(
      { error: "nda_sign_failed", message: "Failed to record NDA signature." },
      { status: 500 },
    );
  }
}
