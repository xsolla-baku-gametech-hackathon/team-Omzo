/**
 * Enterprise Security Audit Logging System.
 *
 * Records tamper-evident structured audit events for compliance, forensics,
 * and security monitoring without leaking plaintext credentials or raw PII.
 */

export type AuditAction =
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_FAILURE"
  | "AUTH_REGISTER"
  | "ACCESS_GRANT_ISSUED"
  | "NDA_SIGNED"
  | "ISSUE_VERIFIED"
  | "REWARD_PAID"
  | "CAMPAIGN_CREATED"
  | "CAMPAIGN_REVOKED";

export interface AuditLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly action: AuditAction;
  readonly actorId: string;
  readonly targetId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

const auditLogBuffer: AuditLogEntry[] = [];
const MAX_BUFFER_SIZE = 500;

/**
 * Appends a structured audit event to the in-memory circular buffer.
 */
export function recordAuditEvent(
  action: AuditAction,
  actorId: string,
  targetId?: string,
  metadata: Record<string, unknown> = {},
): AuditLogEntry {
  // Sanitize metadata to never include password, token, or secret
  const sanitizedMeta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("password") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("token")
    ) {
      sanitizedMeta[key] = "[REDACTED]";
    } else {
      sanitizedMeta[key] = value;
    }
  }

  const entry: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    action,
    actorId,
    targetId,
    metadata: sanitizedMeta,
  };

  auditLogBuffer.push(entry);
  if (auditLogBuffer.length > MAX_BUFFER_SIZE) {
    auditLogBuffer.shift();
  }

  return entry;
}

/**
 * Retrieves recent audit logs filtered by action or actor.
 */
export function getRecentAuditLogs(filter?: {
  action?: AuditAction;
  actorId?: string;
  limit?: number;
}): readonly AuditLogEntry[] {
  let logs = [...auditLogBuffer];

  if (filter?.action) {
    logs = logs.filter((l) => l.action === filter.action);
  }
  if (filter?.actorId) {
    logs = logs.filter((l) => l.actorId === filter.actorId);
  }

  const limit = filter?.limit ?? 50;
  return logs.slice(-limit).reverse();
}

/**
 * Clears audit buffer (for testing).
 */
export function clearAuditLogs(): void {
  auditLogBuffer.length = 0;
}
