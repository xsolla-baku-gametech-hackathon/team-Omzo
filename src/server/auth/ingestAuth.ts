import { verifyGrantToken } from "@/domain/access/token";
import { requireSecret } from "@/server/config/secrets";
import { db } from "@/server/db";
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

/**
 * May this principal file against this campaign?
 *
 * A grant token names its own campaign in a signature the client cannot
 * alter, so holding a valid one is the answer.
 *
 * A session cookie does not. Without this check any signed-in tester could
 * post into any *open* campaign — far narrower than the original hole, where
 * no credential was needed at all, but still someone filing reports against
 * a build they were never given and whose NDA they never signed.
 *
 * AccessGrant is the enrolment record: the schema keeps one row per tester
 * per campaign for life, re-issuance updating it in place, so its presence
 * means this person was genuinely admitted to this build at some point. An
 * expired grant still counts — a tester whose 15-minute build token lapsed
 * mid-session is still a real tester, and their queued reports should land.
 */
export async function mayReportTo(
  principal: IngestPrincipal,
  campaignId: string,
): Promise<boolean> {
  if (principal.via === "grant_token") {
    return principal.campaignId === campaignId;
  }

  const grant = await db.accessGrant.findFirst({
    where: { userId: principal.userId, campaignId },
    select: { id: true },
  });

  return grant !== null;
}
