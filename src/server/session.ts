import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { requireSecretBytes } from "@/server/config/secrets";

/**
 * Custom session layer using jose and httpOnly cookies (SPEC.md §2, §6.5).
 *
 * Rules:
 * - 7 days TTL
 * - HS256 with SESSION_SECRET, which must be provided outside development
 * - httpOnly, sameSite lax, secure in production
 * - Zero external provider dependencies
 */

export const SESSION_COOKIE_NAME = "repro_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Read per call rather than at module load. A throw at import time would
 * take down `next build`, which evaluates modules without the deploy's
 * environment; failing at the point of signing or verifying keeps the
 * failure where it belongs.
 */
function sessionKey(): Uint8Array {
  return requireSecretBytes("SESSION_SECRET");
}

export interface SessionPayload {
  readonly sub: string; // User ID
  readonly email: string;
  readonly role: "TESTER" | "STUDIO";
  readonly displayName: string;
  readonly studioId?: string;
}

/**
 * Signs a session JWT.
 */
export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    displayName: payload.displayName,
    studioId: payload.studioId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionKey());
}

/**
 * Verifies a session JWT and returns the parsed payload, or null if invalid/expired.
 */
export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  // Resolved outside the try on purpose. A malformed or expired token is a
  // normal event and becomes null; a missing or weak SESSION_SECRET is an
  // operator error and must surface rather than be reported as a bad login.
  const key = sessionKey();

  try {
    const { payload } = await jwtVerify(token, key);
    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      (payload.role !== "TESTER" && payload.role !== "STUDIO") ||
      typeof payload.displayName !== "string"
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role as "TESTER" | "STUDIO",
      displayName: payload.displayName,
      studioId:
        typeof payload.studioId === "string" ? payload.studioId : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Retrieves the current user session from cookies, or null if unauthenticated.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Sets the httpOnly session cookie.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * Clears the session cookie.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
