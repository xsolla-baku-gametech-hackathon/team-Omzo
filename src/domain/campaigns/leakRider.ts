/**
 * Platform rider appended to DOWNLOAD NDAs.
 *
 * The studio's markdown remains the primary contract; this block is the
 * platform's non-negotiable redistribution warning. Hashing signs the
 * combined text so a later edit of either part invalidates the signature.
 */

export const LEAK_RIDER_MD = `## Platform redistribution rider

By continuing you acknowledge that:

1. Access to this download build is personal and non-transferable.
2. Redistributing, uploading, torrenting, or publicly sharing the build (or substantial footage that reveals unreleased content against the studio NDA) is a material breach.
3. A breach may result in immediate revocation of access, forfeiture of unclaimed rewards on this campaign, and legal action by the studio that provided the build.

Repro records your acceptance against your account.`;

/** Effective NDA body a DOWNLOAD tester signs and that we hash. */
export function effectiveNdaBody(
  studioNdaMd: string,
  buildKind: "WEB_EMBED" | "DOWNLOAD" | "EXTERNAL_LINK",
): string {
  if (buildKind !== "DOWNLOAD") {
    return studioNdaMd;
  }
  return `${studioNdaMd.trimEnd()}\n\n${LEAK_RIDER_MD}`;
}
