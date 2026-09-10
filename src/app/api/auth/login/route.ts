import { createHash } from "node:crypto";

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

  const limitCheck = rateLimit(`login:ip:${clientIp}`, 10, 0.2);
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

  // Per-address throttling alone does not bound credential stuffing: an
  // attacker with a pool of addresses gets a fresh budget from each one while
  // grinding a single account. This second bucket follows the account instead.
  //
  // Keyed on a hash of the normalised address rather than the address itself,
  // so an attacker cannot grow the in-memory map with arbitrarily long keys,
  // and so the table does not become a list of who has accounts here. The
  // capacity is deliberately generous: it must slow a machine without ever
  // being reachable by someone mistyping their own password.
  const accountKey = createHash("sha256")
    .update(parsed.data.email.trim().toLowerCase())
    .digest("hex");
  const accountLimit = rateLimit(`login:account:${accountKey}`, 20, 0.1);
  if (!accountLimit.allowed) {
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        message: "Too many login attempts. Please wait before trying again.",
        retryAfterSec: accountLimit.retryAfterSec,
      },
      {
        status: 429,
        headers: { "Retry-After": String(accountLimit.retryAfterSec) },
      },
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
