import { NextResponse } from "next/server";

import {
  IssueNotFoundError,
  UnauthorizedIssueMutationError,
  verifyIssue,
} from "@/server/services/issueService";
import { getSession } from "@/server/session";

export async function POST(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: issueId } = await props.params;
  const session = await getSession();

  if (session?.studioId === undefined) {
    return NextResponse.json(
      { error: "unauthorized", message: "Sign in as the owning studio." },
      { status: 401 },
    );
  }

  try {
    const issue = await verifyIssue(issueId, session.studioId);
    return NextResponse.json({ success: true, issue });
  } catch (error) {
    if (error instanceof IssueNotFoundError) {
      return NextResponse.json(
        { error: "not_found", message: error.message },
        { status: 404 },
      );
    }
    if (error instanceof UnauthorizedIssueMutationError) {
      return NextResponse.json(
        { error: "unauthorized", message: error.message },
        { status: 403 },
      );
    }

    console.error("[verifyIssue] unexpected failure", error);
    return NextResponse.json(
      { error: "verify_failed", message: "Failed to verify issue." },
      { status: 500 },
    );
  }
}
