import { NextResponse } from "next/server";

import {
  IssueNotFoundError,
  UnauthorizedIssueMutationError,
  getBoardForStudio,
} from "@/server/services/issueService";
import { getSession } from "@/server/session";

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: campaignId } = await props.params;
  const session = await getSession();

  try {
    return NextResponse.json(
      await getBoardForStudio(campaignId, session?.studioId),
    );
  } catch (error) {
    // A campaign that is not yours and a campaign that does not exist are
    // answered identically. Telling an outsider which campaign ids are real
    // is a disclosure in itself.
    if (
      error instanceof UnauthorizedIssueMutationError ||
      error instanceof IssueNotFoundError
    ) {
      return NextResponse.json(
        { error: "not_found", message: "No such campaign." },
        { status: 404 },
      );
    }

    console.error("[board] unexpected failure", error);
    return NextResponse.json(
      { error: "server_error", message: "Failed to load the board." },
      { status: 500 },
    );
  }
}
