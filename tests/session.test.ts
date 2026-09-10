import { describe, expect, it } from "vitest";

import {
  type SessionPayload,
  createSessionToken,
  verifySessionToken,
} from "@/server/session";

describe("server/session", () => {
  const mockUser: SessionPayload = {
    sub: "user-cuid-123",
    email: "tester@example.com",
    role: "TESTER",
    displayName: "Test Player",
  };

  it("creates and verifies a valid session token", async () => {
    const token = await createSessionToken(mockUser);
    expect(typeof token).toBe("string");

    const verified = await verifySessionToken(token);
    expect(verified).toEqual(mockUser);
  });

  it("handles studio user with studioId", async () => {
    const studioUser: SessionPayload = {
      sub: "studio-cuid-456",
      email: "owner@studio.dev",
      role: "STUDIO",
      displayName: "Studio Dev",
      studioId: "studio-cuid-789",
    };

    const token = await createSessionToken(studioUser);
    const verified = await verifySessionToken(token);
    expect(verified).toEqual(studioUser);
  });

  it("rejects an invalid token string", async () => {
    const verified = await verifySessionToken("invalid-garbage-token");
    expect(verified).toBeNull();
  });
});
