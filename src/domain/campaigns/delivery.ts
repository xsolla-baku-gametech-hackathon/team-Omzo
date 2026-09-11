/**
 * Who holds the binary, and what that makes possible.
 *
 * A studio's unreleased build is the most sensitive asset it owns, and the
 * honest answer to "why would you trust us with it" is that you do not have
 * to: the value Repro adds is the triage, and triage does not require us to
 * hold the file. So delivery mode is a first-class product concept, and the
 * default is the one where the binary never reaches us.
 *
 * It is deliberately **derived** from `buildKind` rather than stored beside
 * it. The two would answer overlapping questions — "how does a tester open
 * this" and "who stores it" — and a stored pair can disagree: nothing in a
 * schema stops `WEB_EMBED` + `LINK_ONLY` from being written together, and
 * whichever one the capability check happened to read would silently decide
 * whether a build claims watermark protection it does not have. A function
 * cannot drift from its own input.
 *
 * Pure and framework-free: the same table drives the campaign form, the play
 * session surface, and the README matrix, so all three cannot disagree.
 */

/**
 * Mirrors `BuildKind` in schema.prisma. Declared locally because domain/ may
 * not import Prisma; `tests/delivery.test.ts` asserts the two stay in step.
 */
export type BuildKind = "WEB_EMBED" | "DOWNLOAD" | "EXTERNAL_LINK";

/** Every build kind, in the order the campaign form offers them. */
export const BUILD_KINDS: readonly BuildKind[] = [
  "EXTERNAL_LINK",
  "WEB_EMBED",
  "DOWNLOAD",
];

export type DeliveryMode = "LINK_ONLY" | "HOSTED" | "SELF_HOSTED";

/**
 * `SELF_HOSTED` has no `BuildKind` because it is not built — the studio would
 * keep the binary on its own infrastructure and call us to validate a grant
 * before serving it. It exists in the type so the capability table can state
 * the roadmap honestly, and `deliveryModeOf` never returns it.
 */
export function deliveryModeOf(buildKind: BuildKind): DeliveryMode {
  switch (buildKind) {
    case "EXTERNAL_LINK":
      return "LINK_ONLY";
    case "WEB_EMBED":
    case "DOWNLOAD":
      return "HOSTED";
  }
}

export interface DeliveryCapabilities {
  /**
   * Every rendered frame carries the tester's watermark, so a leaked
   * screenshot names an account. Only possible when we render the build.
   */
  readonly watermarksFrames: boolean;
  /** The access link dies on first use. */
  readonly singleUseAccess: boolean;
  /** The build cannot be reached without a live, UA-bound grant. */
  readonly gatedByGrant: boolean;
  /** Who accepted which NDA text, recorded against a person. */
  readonly ndaRecorded: boolean;
  /** Every access attempt is written to an append-only log. */
  readonly accessLogged: boolean;
  /**
   * Always false, in every mode. Once a file is on someone's machine we
   * cannot stop them passing it on, and a product that implied otherwise
   * would be lying to the one customer who most needs the truth.
   */
  readonly preventsForwarding: boolean;
}

const CAPABILITIES: Record<BuildKind, DeliveryCapabilities> = {
  WEB_EMBED: {
    watermarksFrames: true,
    singleUseAccess: false,
    gatedByGrant: true,
    ndaRecorded: true,
    accessLogged: true,
    preventsForwarding: false,
  },
  DOWNLOAD: {
    // The watermark is drawn into rendered frames. A downloaded binary is
    // not rendered by us, so there is nothing to draw into.
    watermarksFrames: false,
    singleUseAccess: true,
    gatedByGrant: true,
    ndaRecorded: true,
    accessLogged: true,
    preventsForwarding: false,
  },
  EXTERNAL_LINK: {
    watermarksFrames: false,
    singleUseAccess: false,
    // We still gate the redirect, so the studio's URL is not reachable
    // without a grant — but the destination is the studio's to protect.
    gatedByGrant: true,
    ndaRecorded: true,
    accessLogged: true,
    preventsForwarding: false,
  },
};

export function capabilitiesOf(buildKind: BuildKind): DeliveryCapabilities {
  return CAPABILITIES[buildKind];
}

export const DELIVERY_MODE_LABEL: Record<DeliveryMode, string> = {
  LINK_ONLY: "Link only",
  HOSTED: "Hosted with Repro",
  SELF_HOSTED: "Self-hosted",
};

/**
 * The limitation to print next to the mode, in the studio's own interest.
 * Stated on the campaign form rather than buried in terms, because a studio
 * that discovers this after a leak is a studio we have failed.
 */
export const DELIVERY_MODE_CAVEAT: Record<DeliveryMode, string> = {
  LINK_ONLY:
    "The binary never reaches us, so we cannot watermark frames or stop a tester forwarding your link. We control who receives it and record who accepted the NDA.",
  HOSTED:
    "We serve the build, so every frame carries the tester's watermark and a leaked screenshot names an account within seconds.",
  SELF_HOSTED:
    "Not available yet. Your infrastructure serves the build and calls us to validate each grant first.",
};

/** The recommended default for a new campaign. */
export const DEFAULT_BUILD_KIND: BuildKind = "EXTERNAL_LINK";
