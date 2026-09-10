import { NextResponse } from "next/server";

import {
  IssueNotFoundError,
  UnauthorizedIssueMutationError,
  splitDuplicate,
} from "@/server/services/issueService";
import { getSession } from "@/server/session";

export async function POST(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: reportId } = await props.params;
  const session = await getSession();

  try {
    return NextResponse.json(await splitDuplicate(reportId, session?.studioId));
  } catch (error) {
    if (
      error instanceof UnauthorizedIssueMutationError ||
      error instanceof IssueNotFoundError
    ) {
      return NextResponse.json(
        { error: "not_found", message: "No such possible duplicate." },
        { status: 404 },
      );
    }

    console.error("[splitDuplicate] unexpected failure", error);
    return NextResponse.json(
      { error: "action_failed", message: "The change could not be saved." },
      { status: 500 },
    );
  }
}
