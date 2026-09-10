import { NextResponse } from "next/server";
import { z } from "zod";

import {
  InvalidCredentialsError,
  loginUser,
} from "@/server/services/authService";
import { createSessionToken, setSessionCookie } from "@/server/session";

import { rateLimit } from "@/server/security/rateLimiter";

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(100),
});

export async function POST(request: Request): Promise<NextResponse> {
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1";

  const limitCheck = rateLimit(`login:${clientIp}`, 10, 0.2);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        message: "Too many login attempts. Please wait before trying again.",
        retryAfterSec: limitCheck.retryAfterSec,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limitCheck.retryAfterSec),
        },
      },
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
