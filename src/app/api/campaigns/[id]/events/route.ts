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

/** Keeps proxies from timing the connection out mid-playtest. */
const HEARTBEAT_MS = 15_000;

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

  /**
   * Unsubscribe and stop the heartbeat, exactly once.
   *
   * Every path that can discover the client is gone routes through here.
   * Previously only cancel() released anything, and the listener swallowed
   * enqueue failures silently -- so a client that vanished without cancel()
   * firing left its subscription registered against the campaign for the
   * lifetime of the process. On a board left open across a long playtest
   * that is an unbounded set of dead listeners, each one serialising every
   * subsequent event into a closed stream.
   */
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    cleanup?.();
    cleanup = null;
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  };

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
          // The stream is closed: the client is gone. Let go of it rather
          // than staying subscribed to serialise events into a dead socket.
          release();
        }
      };

      cleanup = campaignEvents.subscribe(campaignId, listener);

      // The reliable disconnect signal. cancel() is not guaranteed to run on
      // every abort path, so this is what actually bounds the subscription.
      request.signal.addEventListener("abort", release, { once: true });

      // A client that aborted before start() ran would otherwise never be
      // released, because the abort event has already fired by now.
      if (request.signal.aborted) release();

      // Heartbeat ping every 15 seconds to keep the connection alive
      interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          release();
        }
      }, HEARTBEAT_MS);
    },
    cancel() {
      release();
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
