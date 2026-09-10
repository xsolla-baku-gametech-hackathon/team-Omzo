import { NextResponse } from "next/server";
import { z } from "zod";

import {
  InvalidCredentialsError,
  loginUser,
} from "@/server/services/authService";
import { createSessionToken, setSessionCookie } from "@/server/session";

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(100),
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

  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Invalid login credentials.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  try {
    const session = await loginUser(parsed.data);
    const token = await createSessionToken(session);
    await setSessionCookie(token);

    return NextResponse.json({
      user: {
        id: session.sub,
        email: session.email,
        role: session.role,
        displayName: session.displayName,
        studioId: session.studioId,
      },
    });
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return NextResponse.json(
        { error: "invalid_credentials", message: error.message },
        { status: 401 },
      );
    }

    console.error("[login] unexpected failure", error);
    return NextResponse.json(
      {
        error: "login_failed",
        message: "Unable to log in. Please try again.",
      },
      { status: 500 },
    );
  }
}
