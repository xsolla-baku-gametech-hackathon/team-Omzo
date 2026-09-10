import type { Prisma, Report as ReportRow } from "@prisma/client";

import { categorise } from "@/domain/triage/category";
import type {
  GameState,
  Issue,
  PreparedReport,
  SystemInfo,
} from "@/domain/triage/types";

/**
 * The one place a database row becomes something the domain understands.
 *
 * Shared by ingest and by the confirm/split actions, because two mappings of
 * the same row is two chances to disagree about what a report is -- and the
 * domain's answers are only as good as what it was handed.
 */

export function toPreparedReport(row: ReportRow): PreparedReport {
  return {
    id: row.id,
    reporterId: row.reporterId,
    body: row.body,
    gameState: row.gameState as unknown as GameState,
    systemInfo: row.systemInfo as unknown as SystemInfo,
    consoleTail: row.consoleTail,
    createdAt: row.createdAt.getTime(),
    tokens: row.tokens,
    signature: row.signature,
    normalisedBody: row.normalisedBody,
    // Cheap and pure, so derived rather than stored: one less column that can
    // disagree with the tokens sitting next to it.
    category: categorise(row.tokens),
    isNoise: row.isNoise,
  };
}

export function sharedTraitsOf(issue: Issue): Prisma.InputJsonValue {
  const asObject = (
    tally: ReadonlyMap<string, number>,
  ): Record<string, number> => Object.fromEntries(tally);

  return {
    gpu: asObject(issue.environment.gpu),
    os: asObject(issue.environment.os),
    browser: asObject(issue.environment.browser),
    scene: issue.scene,
    bucket: { ...issue.bucket },
  };
}
