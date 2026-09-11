import { NextResponse } from "next/server";

/**
 * Standardized enterprise API response wrappers.
 *
 * Ensures all endpoints produce consistent, predictable payloads
 * for client consuming applications, mobile SDKs, and error monitors.
 */

export interface ApiSuccessPayload<T> {
  readonly ok: true;
  readonly data: T;
  readonly timestamp: string;
}

export interface ApiErrorPayload {
  readonly ok: false;
  readonly error: string;
  readonly message: string;
  readonly status: number;
  readonly details?: unknown;
  readonly timestamp: string;
}

export function apiSuccess<T>(
  data: T,
  status: number = 200,
  headers?: Record<string, string>,
): NextResponse<ApiSuccessPayload<T>> {
  const payload: ApiSuccessPayload<T> = {
    ok: true,
    data,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, { status, headers });
}

export function apiError(
  error: string,
  message: string,
  status: number = 400,
  details?: unknown,
  headers?: Record<string, string>,
): NextResponse<ApiErrorPayload> {
  const payload: ApiErrorPayload = {
    ok: false,
    error,
    message,
    status,
    ...(details !== undefined ? { details } : {}),
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, { status, headers });
}

export function extractErrorMessage(
  err: unknown,
  fallback: string = "An unexpected error occurred",
): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "string" && err.trim()) {
    return err.trim();
  }
  return fallback;
}
