import { NextResponse } from "next/server";

import { trustLevelOf, trustTierOf } from "@/domain/trust/level";
import { db } from "@/server/db";
import { getSession } from "@/server/session";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      signalScore: true,
      birthDate: true,
      studio: { select: { id: true, name: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const trustLevel = trustLevelOf(user.signalScore);

  return NextResponse.json({
    user: {
      ...user,
      trustLevel,
      trustTier: trustTierOf(trustLevel),
    },
  });
}
