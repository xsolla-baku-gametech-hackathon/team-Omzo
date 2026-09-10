import { describe, expect, it } from "vitest";

import {
  type GrantTokenPayload,
  signGrantToken,
  verifyGrantToken,
} from "@/domain/access/token";

describe("domain/access/token", () => {
  const secret = "test-secret-key-for-hmac-sha256-1234567890";
  const otherSecret = "different-secret-key-entirely-0987654321";

  const validPayload: GrantTokenPayload = {
    grantId: "grant-123",
    campaignId: "campaign-456",
    userId: "user-789",
    watermarkId: 42000,
    exp: 2000000000, // Year 2033
  };

  it("successfully signs and verifies a valid token", () => {
    const token = signGrantToken(validPayload, secret);
    expect(typeof token).toBe("string");
    expect(token).toContain(".");

    const result = verifyGrantToken(token, secret, 1900000000);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload).toEqual(validPayload);
    }
  });

  it("rejects an expired token", () => {
    const expiredPayload: GrantTokenPayload = {
      ...validPayload,
      exp: 1000000,
    };
    const token = signGrantToken(expiredPayload, secret);
    const result = verifyGrantToken(token, secret, 1000001);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("expired");
    }
  });

  it("rejects a token verified with the wrong secret", () => {
    const token = signGrantToken(validPayload, secret);
    const result = verifyGrantToken(token, otherSecret, 1900000000);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("invalid_signature");
    }
  });

  it("rejects a tampered payload", () => {
    const token = signGrantToken(validPayload, secret);
    const [encodedPayload, signature] = token.split(".");

    // Alter the payload
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, "base64").toString("utf8"),
    );
    decoded.watermarkId = 99999;
    const tamperedPayload = Buffer.from(JSON.stringify(decoded))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const tamperedToken = `${tamperedPayload}.${signature}`;
    const result = verifyGrantToken(tamperedToken, secret, 1900000000);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("invalid_signature");
    }
  });

  it("rejects a tampered signature", () => {
    const token = signGrantToken(validPayload, secret);
    const [encodedPayload, signature] = token.split(".");

    // Change last char of signature
    const tamperedSig =
      signature.slice(0, -1) + (signature.slice(-1) === "a" ? "b" : "a");
    const tamperedToken = `${encodedPayload}.${tamperedSig}`;

    const result = verifyGrantToken(tamperedToken, secret, 1900000000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("invalid_signature");
    }
  });

  it("rejects malformed tokens", () => {
    expect(verifyGrantToken("not-a-valid-token", secret).valid).toBe(false);
    expect(verifyGrantToken("a.b.c", secret).valid).toBe(false);
    expect(verifyGrantToken("", secret).valid).toBe(false);
    expect(verifyGrantToken(".", secret).valid).toBe(false);
  });
});
