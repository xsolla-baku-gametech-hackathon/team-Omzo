import { EventEmitter } from "node:events";

/**
 * In-process realtime event bus for Server-Sent Events (SPEC.md §0.5, §8).
 *
 * Runs fully offline with zero Redis or external broker dependencies.
 * Global singleton survives dev-mode module reloads.
 */

export type CampaignEventType =
  "report_ingested" | "issue_created" | "issue_updated" | "issue_verified";

export interface ReportIngestedPayload {
  readonly reportId: string;
  readonly campaignId: string;
  readonly body: string;
  readonly reporterName?: string;
  readonly scene: string;
  readonly isNoise: boolean;
  readonly issueId: string | null;
  readonly issueTitle: string | null;
  readonly createdAt: number;
}

export interface IssueUpdatedPayload {
  readonly campaignId: string;
  readonly issueId: string;
  readonly title: string;
  readonly category: string;
  readonly severity: string;
  readonly occurrenceCount: number;
  readonly status: string;
}

export type CampaignEvent =
  | {
      readonly type: "report_ingested";
      readonly payload: ReportIngestedPayload;
    }
  | { readonly type: "issue_created"; readonly payload: IssueUpdatedPayload }
  | { readonly type: "issue_updated"; readonly payload: IssueUpdatedPayload }
  | {
      readonly type: "issue_verified";
      readonly payload: {
        readonly campaignId: string;
        readonly issueId: string;
        readonly verifiedAt: string;
      };
    };

class CampaignEventHub {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  emit(event: CampaignEvent): void {
    const campaignId =
      "campaignId" in event.payload ? event.payload.campaignId : "";
    if (campaignId) {
      this.emitter.emit(`campaign:${campaignId}`, event);
    }
    this.emitter.emit("all", event);
  }

  subscribe(
    campaignId: string,
    listener: (event: CampaignEvent) => void,
  ): () => void {
    const channel = `campaign:${campaignId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }
}

const globalForEvents = globalThis as unknown as {
  campaignEvents?: CampaignEventHub;
};

export const campaignEvents =
  globalForEvents.campaignEvents ?? new CampaignEventHub();

if (process.env.NODE_ENV !== "production") {
  globalForEvents.campaignEvents = campaignEvents;
}
