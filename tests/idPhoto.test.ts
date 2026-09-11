import { describe, expect, it } from "vitest";

import { MAX_ID_PHOTO_BYTES, validateIdPhoto } from "@/domain/access/idPhoto";

const PNG_HEADER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);

describe("validateIdPhoto", () => {
  it("rejects an empty upload", () => {
    expect(validateIdPhoto(new Uint8Array()).valid).toBe(false);
  });

  it("accepts a PNG signature", () => {
    const result = validateIdPhoto(PNG_HEADER);
    expect(result.valid).toBe(true);
    expect(result.mimeType).toBe("image/png");
  });

  it("accepts a JPEG signature", () => {
    const result = validateIdPhoto(JPEG_HEADER);
    expect(result.valid).toBe(true);
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("rejects anything else, regardless of a claimed extension", () => {
    const result = validateIdPhoto(Uint8Array.from([0x25, 0x50, 0x44, 0x46]));
    expect(result.valid).toBe(false);
  });

  it("rejects a file over the size limit", () => {
    const oversized = new Uint8Array(MAX_ID_PHOTO_BYTES + 1);
    oversized.set(PNG_HEADER);
    expect(validateIdPhoto(oversized).valid).toBe(false);
  });
});
