import { db } from "@/server/db";
import { campaignEvents } from "@/server/events";
import type { CampaignEvent } from "@/server/events";
import { getSession } from "@/server/session";

/**
 * Server-Sent Events (SSE) route for real-time campaign updates (SPEC.md §0.5, §8).
 *
 * Emits:
 * - report_ingested: when a new raw report enters the campaign
 * - issue_created: when an issue is opened
 * - issue_updated: when an issue gains occurrences or shifts severity
 * - issue_verified: when an issue is verified by the studio
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: campaignId } = await props.params;

  // The stream carries report bodies as they arrive -- a running description
  // of an unreleased build, which is the thing testers sign an NDA about. It
  // needs the same ownership check the board itself has.
  const session = await getSession();
  if (session?.studioId === undefined) {
    return new Response("Not found", { status: 404 });
  }
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { studioId: true },
  });
  if (campaign === null || campaign.studioId !== session.studioId) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let interval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connected message
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ campaignId })}\n\n`,
        ),
      );

      const listener = (event: CampaignEvent) => {
        try {
          const payload = JSON.stringify(event.payload);
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${payload}\n\n`),
          );
        } catch {
          // Client disconnected
        }
      };

      cleanup = campaignEvents.subscribe(campaignId, listener);

      // Heartbeat ping every 15 seconds to keep the connection alive
      interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          if (interval) clearInterval(interval);
        }
      }, 15000);
    },
    cancel() {
      if (cleanup) cleanup();
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
