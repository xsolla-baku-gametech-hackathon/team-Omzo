/**
 * Plain data the triage engine works over.
 *
 * These deliberately mirror the Prisma models without importing them. domain/
 * describes the shapes it needs; server/ is responsible for handing it rows
 * that fit. That is what keeps this whole directory testable without a
 * database (SPEC.md §3).
 */

export type IssueCategory =
  "CRASH" | "VISUAL" | "GAMEPLAY" | "PERFORMANCE" | "AUDIO" | "UX";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface GameState {
  readonly scene: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly playtimeSec: number;
}

export interface SystemInfo {
  readonly os: string;
  readonly browser: string;
  readonly gpuRenderer: string;
  readonly screen: string;
  readonly memoryGb?: number;
}

/** A report as it arrives at the ingest boundary, before triage touches it. */
export interface IncomingReport {
  readonly id: string;
  readonly reporterId: string;
  readonly body: string;
  readonly gameState: GameState;
  readonly systemInfo: SystemInfo;
  readonly consoleTail: readonly string[];
  /** Milliseconds since epoch. A Date would work; a number compares cleanly. */
  readonly createdAt: number;
}

/** The same report once the cheap deterministic fields are derived. */
export interface PreparedReport extends IncomingReport {
  readonly tokens: readonly string[];
  readonly signature: string;
  readonly normalisedBody: string;
  readonly category: IssueCategory;
  readonly isNoise: boolean;
}

/** A coordinate bucketed to the configured grid. */
export interface Bucket {
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
}

/** Counts of each observed value, e.g. {"AMD": 16, "NVIDIA": 2}. */
export type TraitTally = ReadonlyMap<string, number>;

export interface EnvironmentTally {
  readonly gpu: TraitTally;
  readonly os: TraitTally;
  readonly browser: TraitTally;
}

/** An issue as triage sees it: its occurrences and what they have in common. */
export interface Issue {
  readonly id: string;
  readonly category: IssueCategory;
  readonly severity: Severity;
  readonly firstReporterId: string;
  /** Fallback title. The LLM may rewrite it later; it is never required to. */
  readonly title: string;
  readonly reports: readonly PreparedReport[];
  /** Reports in the possible-duplicate band, awaiting a human decision. */
  readonly possibleDuplicates: readonly PreparedReport[];
  readonly signature: string;
  readonly scene: string;
  readonly bucket: Bucket;
  readonly environment: EnvironmentTally;
}

/** What each signal contributed, kept so the UI and tests can explain a merge. */
export interface ScoreBreakdown {
  readonly lexical: number;
  readonly state: number;
  readonly signature: number;
  readonly environment: number;
  readonly combined: number;
  /** True when an exact log signature match raised the combined score. */
  readonly signatureFloorApplied: boolean;
}

export type Decision =
  | {
      readonly kind: "attach";
      readonly issueId: string;
      readonly score: ScoreBreakdown;
    }
  | {
      readonly kind: "possible";
      readonly issueId: string;
      readonly score: ScoreBreakdown;
    }
  | { readonly kind: "new" }
  | { readonly kind: "noise" };
