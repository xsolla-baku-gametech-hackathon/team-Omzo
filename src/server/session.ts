import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

/**
 * Custom session layer using jose and httpOnly cookies (SPEC.md §2, §6.5).
 *
 * Rules:
 * - 7 days TTL
 * - HS256 with SESSION_SECRET
 * - httpOnly, sameSite lax, secure in production
 * - Zero external provider dependencies
 */

export const SESSION_COOKIE_NAME = "repro_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ??
    "fallback-dev-session-secret-at-least-32-chars-long",
);

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
    .sign(SESSION_SECRET);
}

/**
 * Verifies a session JWT and returns the parsed payload, or null if invalid/expired.
 */
export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
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
