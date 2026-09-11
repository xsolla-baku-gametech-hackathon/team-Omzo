import { NextResponse } from "next/server";

import { campaignEvents } from "@/server/events";
import { getSession } from "@/server/session";

/**
 * Development-only introspection: how many SSE listeners are registered for
 * a campaign. Used to prove the events route releases subscriptions when a
 * client disconnects. Refuses to exist outside development.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = await getSession();
  if (session?.studioId === undefined) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    count: campaignEvents.listenerCount("seed-campaign"),
  });
}
