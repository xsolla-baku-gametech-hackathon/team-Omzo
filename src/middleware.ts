import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Enterprise Security Middleware.
 *
 * Enforces defense-in-depth headers across all routes:
 * - Anti-MIME sniffing (X-Content-Type-Options)
 * - Clickjacking defense (X-Frame-Options)
 * - Strict Referrer Policy
 * - Restrictive Permissions Policy
 * - CORS headers for the WebGL / canvas in-game overlay
 */

export function middleware(request: NextRequest): NextResponse {
  // Handle CORS preflight for the in-game overlay posting to /api/ingest
  if (
    request.method === "OPTIONS" &&
    request.nextUrl.pathname.startsWith("/api/ingest")
  ) {
    const response = new NextResponse(null, { status: 204 });
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    response.headers.set("Access-Control-Max-Age", "86400");
    return response;
  }

  const response = NextResponse.next();

  // Security Headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  );

  // If in production, enable HSTS
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  // Permissive CORS on /api/ingest so third-party WebGL builds can report bugs
  if (request.nextUrl.pathname.startsWith("/api/ingest")) {
    response.headers.set("Access-Control-Allow-Origin", "*");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
