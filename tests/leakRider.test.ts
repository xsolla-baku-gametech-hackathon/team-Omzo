import { describe, expect, it } from "vitest";

import { effectiveNdaBody, LEAK_RIDER_MD } from "@/domain/campaigns/leakRider";

describe("effectiveNdaBody", () => {
  it("leaves link and web NDA unchanged", () => {
    expect(effectiveNdaBody("Studio NDA", "EXTERNAL_LINK")).toBe("Studio NDA");
    expect(effectiveNdaBody("Studio NDA", "WEB_EMBED")).toBe("Studio NDA");
  });

  it("appends the leak rider for DOWNLOAD", () => {
    const body = effectiveNdaBody("Studio NDA", "DOWNLOAD");
    expect(body.startsWith("Studio NDA")).toBe(true);
    expect(body).toContain(LEAK_RIDER_MD);
  });
});
