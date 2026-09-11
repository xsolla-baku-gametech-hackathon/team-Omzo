import { NextResponse } from "next/server";
import { z } from "zod";

import {
  parseBirthDateInput,
  validateAdultAge,
  validateLegalName,
} from "@/domain/access/identityRules";
import {
  EmailAlreadyExistsError,
  InvalidDisplayNameError,
  StudioNameRequiredError,
  UnderageRegistrationError,
  WeakPasswordError,
  registerUser,
} from "@/server/services/authService";
import { createSessionToken, setSessionCookie } from "@/server/session";

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  displayName: z.string().min(2).max(100),
  role: z.enum(["TESTER", "STUDIO"]),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD.")
    .or(z.string().datetime({ offset: true })),
  studioName: z.string().min(2).max(100).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Invalid registration details.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const nameCheck = validateLegalName(parsed.data.displayName);
  if (!nameCheck.valid) {
    return NextResponse.json(
      {
        error: "invalid_display_name",
        message:
          nameCheck.reason ?? "Enter both your first and last name.",
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
          "You must be at least 18 years old to create an account.",
      },
      { status: 422 },
    );
  }

  try {
    const session = await registerUser({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      birthDate,
      studioName: parsed.data.studioName,
    });

    const token = await createSessionToken(session);
    await setSessionCookie(token);

    return NextResponse.json(
      {
        user: {
          id: session.sub,
          email: session.email,
          role: session.role,
          displayName: session.displayName,
          studioId: session.studioId,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      return NextResponse.json(
        { error: "email_exists", message: error.message },
        { status: 409 },
      );
    }
    if (error instanceof StudioNameRequiredError) {
      return NextResponse.json(
        { error: "studio_name_required", message: error.message },
        { status: 422 },
      );
    }
    if (error instanceof InvalidDisplayNameError) {
      return NextResponse.json(
        { error: "invalid_display_name", message: error.message },
        { status: 422 },
      );
    }
    if (error instanceof UnderageRegistrationError) {
      return NextResponse.json(
        { error: "underage", message: error.message },
        { status: 422 },
      );
    }
    if (error instanceof WeakPasswordError) {
      return NextResponse.json(
        {
          error: "weak_password",
          message: error.message,
          reasons: error.reasons,
        },
        { status: 422 },
      );
    }

    console.error("[register] unexpected failure", error);
    return NextResponse.json(
      {
        error: "registration_failed",
        message: "Unable to complete registration. Please try again.",
      },
      { status: 500 },
    );
  }
}
