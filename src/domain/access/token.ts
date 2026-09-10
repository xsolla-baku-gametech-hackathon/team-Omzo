import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure signed access tokens (SPEC.md §6.1).
 *
 * Format: base64url(JSON.stringify(payload)) + "." + base64url(hmacSha256(encodedPayload, secret))
 * Payload: { grantId, campaignId, userId, watermarkId, exp }
 *
 * This file is purely functional and contains no I/O, no database access, and
 * no framework imports, ensuring domain purity.
 */

export interface GrantTokenPayload {
  readonly grantId: string;
  readonly campaignId: string;
  readonly userId: string;
  readonly watermarkId: number;
  /** Expiration timestamp in epoch seconds */
  readonly exp: number;
}

export type TokenVerificationResult =
  | { readonly valid: true; readonly payload: GrantTokenPayload }
  | {
      readonly valid: false;
      readonly reason: "expired" | "invalid_signature" | "malformed";
    };

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

function hmacSha256(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

/**
 * Creates a signed build access token.
 */
export function signGrantToken(
  payload: GrantTokenPayload,
  secret: string,
): string {
  const json = JSON.stringify({
    grantId: payload.grantId,
    campaignId: payload.campaignId,
    userId: payload.userId,
    watermarkId: payload.watermarkId,
    exp: payload.exp,
  });
  const encodedPayload = base64UrlEncode(json);
  const signature = base64UrlEncode(hmacSha256(encodedPayload, secret));
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies a build access token against the secret and expiration.
 *
 * @param token The token string in format payload.signature
 * @param secret The HMAC secret key
 * @param nowSeconds Optional current timestamp in seconds (defaults to Date.now() / 1000)
 */
export function verifyGrantToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): TokenVerificationResult {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "malformed" };
  }

  const [encodedPayload, providedSignature] = parts;
  if (!encodedPayload || !providedSignature) {
    return { valid: false, reason: "malformed" };
  }

  const expectedSignatureBuffer = hmacSha256(encodedPayload, secret);
  const expectedSignature = base64UrlEncode(expectedSignatureBuffer);

  const providedSigBuffer = Buffer.from(providedSignature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (
    providedSigBuffer.length !== expectedSigBuffer.length ||
    !timingSafeEqual(providedSigBuffer, expectedSigBuffer)
  ) {
    return { valid: false, reason: "invalid_signature" };
  }

  let payload: unknown;
  try {
    const rawJson = base64UrlDecode(encodedPayload);
    payload = JSON.parse(rawJson);
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as GrantTokenPayload).grantId !== "string" ||
    typeof (payload as GrantTokenPayload).campaignId !== "string" ||
    typeof (payload as GrantTokenPayload).userId !== "string" ||
    typeof (payload as GrantTokenPayload).watermarkId !== "number" ||
    typeof (payload as GrantTokenPayload).exp !== "number"
  ) {
    return { valid: false, reason: "malformed" };
  }

  const parsed = payload as GrantTokenPayload;
  if (parsed.exp < nowSeconds) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, payload: parsed };
}
