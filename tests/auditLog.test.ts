import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAuditLogs,
  getRecentAuditLogs,
  recordAuditEvent,
} from "@/server/security/auditLog";

describe("auditLog system", () => {
  beforeEach(() => {
    clearAuditLogs();
  });

  it("records and retrieves structured audit entries", () => {
    const entry = recordAuditEvent("AUTH_LOGIN_SUCCESS", "user_123", "session_abc", {
      ip: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });

    expect(entry.action).toBe("AUTH_LOGIN_SUCCESS");
    expect(entry.actorId).toBe("user_123");
    expect(entry.targetId).toBe("session_abc");

    const recent = getRecentAuditLogs();
    expect(recent.length).toBe(1);
    expect(recent[0]?.id).toBe(entry.id);
  });

  it("automatically redacts sensitive keys like password and token in metadata", () => {
    const entry = recordAuditEvent("AUTH_LOGIN_FAILURE", "unknown_user", undefined, {
      attemptedPassword: "supersecretpassword",
      apiToken: "eyJhbGciOi...",
      cleanField: "safe_value",
    });

    expect(entry.metadata.attemptedPassword).toBe("[REDACTED]");
    expect(entry.metadata.apiToken).toBe("[REDACTED]");
    expect(entry.metadata.cleanField).toBe("safe_value");
  });

  it("filters logs by action", () => {
    recordAuditEvent("AUTH_LOGIN_SUCCESS", "u1");
    recordAuditEvent("CAMPAIGN_CREATED", "u2");
    recordAuditEvent("AUTH_LOGIN_SUCCESS", "u3");

    const loginLogs = getRecentAuditLogs({ action: "AUTH_LOGIN_SUCCESS" });
    expect(loginLogs.length).toBe(2);

    const campaignLogs = getRecentAuditLogs({ action: "CAMPAIGN_CREATED" });
    expect(campaignLogs.length).toBe(1);
  });
});
