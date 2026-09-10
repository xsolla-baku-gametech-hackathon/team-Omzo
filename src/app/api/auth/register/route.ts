import { NextResponse } from "next/server";
import { z } from "zod";

import {
  EmailAlreadyExistsError,
  StudioNameRequiredError,
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
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
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

  try {
    const session = await registerUser({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      birthDate: parsed.data.birthDate
        ? new Date(parsed.data.birthDate)
        : undefined,
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
