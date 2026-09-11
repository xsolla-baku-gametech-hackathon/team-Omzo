import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  BUILD_KINDS,
  DEFAULT_BUILD_KIND,
  DELIVERY_MODE_CAVEAT,
  DELIVERY_MODE_LABEL,
  capabilitiesOf,
  deliveryModeOf,
  type BuildKind,
} from "@/domain/campaigns/delivery";

const SCHEMA = fileURLToPath(
  new URL("../prisma/schema.prisma", import.meta.url),
);

/** The enum members Prisma will actually accept, read from the schema. */
function schemaBuildKinds(): string[] {
  const source = readFileSync(SCHEMA, "utf8");
  const block = /enum BuildKind \{([^}]*)\}/.exec(source);
  if (block === null) throw new Error("BuildKind enum not found in schema");
  return block[1]
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => line.length > 0);
}

describe("delivery mode", () => {
  it("covers exactly the build kinds the database can store", () => {
    // domain/ may not import Prisma, so the mirrored union is asserted against
    // the schema instead. A new BuildKind with no capability row would
    // otherwise reach the UI as `undefined` and render as no protection at all.
    expect([...BUILD_KINDS].sort()).toEqual(schemaBuildKinds().sort());
  });

  it("maps every build kind to a mode, and never invents SELF_HOSTED", () => {
    for (const kind of BUILD_KINDS) {
      const mode = deliveryModeOf(kind);
      expect(DELIVERY_MODE_LABEL[mode]).toBeTypeOf("string");
      expect(DELIVERY_MODE_CAVEAT[mode]).toBeTypeOf("string");
      // Nothing is built for it yet, so returning it would promise a path
      // that does not exist.
      expect(mode).not.toBe("SELF_HOSTED");
    }

    expect(deliveryModeOf("EXTERNAL_LINK")).toBe("LINK_ONLY");
    expect(deliveryModeOf("WEB_EMBED")).toBe("HOSTED");
    expect(deliveryModeOf("DOWNLOAD")).toBe("HOSTED");
  });

  it("claims frame watermarking only where frames are ours to render", () => {
    expect(capabilitiesOf("WEB_EMBED").watermarksFrames).toBe(true);
    // A downloaded binary and a studio's own URL are both rendered somewhere
    // we do not control, so there is no frame to write into.
    expect(capabilitiesOf("DOWNLOAD").watermarksFrames).toBe(false);
    expect(capabilitiesOf("EXTERNAL_LINK").watermarksFrames).toBe(false);
  });

  it("burns single-use access to downloads only", () => {
    expect(capabilitiesOf("DOWNLOAD").singleUseAccess).toBe(true);
    expect(capabilitiesOf("WEB_EMBED").singleUseAccess).toBe(false);
    expect(capabilitiesOf("EXTERNAL_LINK").singleUseAccess).toBe(false);
  });

  it("gates, records and logs in every mode including link-only", () => {
    // The point of LINK_ONLY is that it gives up watermarking and nothing
    // else. If it also quietly gave up the grant gate, it would be a plain
    // public link with extra steps.
    for (const kind of BUILD_KINDS) {
      const caps = capabilitiesOf(kind);
      expect(caps.gatedByGrant).toBe(true);
      expect(caps.ndaRecorded).toBe(true);
      expect(caps.accessLogged).toBe(true);
    }
  });

  it("never claims to prevent forwarding, in any mode", () => {
    // Protecting a file on someone else's machine is unsolved. This assertion
    // exists so a future optimistic edit to the table fails here rather than
    // in front of a studio.
    for (const kind of BUILD_KINDS) {
      expect(capabilitiesOf(kind).preventsForwarding).toBe(false);
    }
  });

  it("defaults to the mode where the binary never reaches us", () => {
    expect(DEFAULT_BUILD_KIND).toBe("EXTERNAL_LINK" satisfies BuildKind);
    expect(deliveryModeOf(DEFAULT_BUILD_KIND)).toBe("LINK_ONLY");
  });
});
