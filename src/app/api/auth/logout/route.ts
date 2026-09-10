import { NextResponse } from "next/server";

import { clearSessionCookie } from "@/server/session";

export async function POST(): Promise<NextResponse> {
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
