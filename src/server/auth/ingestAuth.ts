import { verifyGrantToken } from "@/domain/access/token";
import { requireSecret } from "@/server/config/secrets";
import { getSession } from "@/server/session";

/**
 * Who is filing this report?
 *
 * POST /api/ingest used to answer that from a `reporterId` field in the
 * request body, with a comment claiming the overlay took it from the
 * authenticated session. Nothing checked that. With
 * `Access-Control-Allow-Origin: *` on the same route, any host on the
 * internet could file a report against any campaign as any user, which is
 * not only spam:
 *
 *   - reports drive `penaliseNoise(reporterId)`, so an attacker could burn
 *     down another tester's standing by filing junk in their name;
 *   - reports drive reward payouts, so an attacker could farm coins;
 *   - the whole product offers reports as evidence, and evidence anyone can
 *     forge is not evidence.
 *
 * Identity is now always derived server-side, from one of two credentials,
 * and the body no longer carries a reporter at all.
 */

export type IngestPrincipal = {
  readonly userId: string;
  /**
   * Present only for grant-token callers, where the campaign is part of the
   * signed payload and therefore not the caller's to choose.
   */
  readonly campaignId?: string;
  readonly via: "grant_token" | "session";
};

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer") return null;

  const token = rest.join("");
  return token.length > 0 ? token : null;
}

/**
 * Returns the principal behind an ingest request, or null when the request
 * carries no usable credential.
 *
 * A signed grant token wins over a session cookie: it is the credential the
 * in-game overlay holds, it names the campaign as well as the user, and a
 * cross-origin build cannot send cookies anyway.
 */
export async function authenticateIngest(
  request: Request,
): Promise<IngestPrincipal | null> {
  const token = bearerToken(request);

  if (token !== null) {
    const result = verifyGrantToken(token, requireSecret("ACCESS_SECRET"));
    if (!result.valid) return null;

    return {
      userId: result.payload.userId,
      campaignId: result.payload.campaignId,
      via: "grant_token",
    };
  }

  // First-party fallback: the tester is playing on our own session page, so
  // the httpOnly cookie is present and same-origin.
  const session = await getSession();
  if (session === null) return null;

  return { userId: session.sub, via: "session" };
}
