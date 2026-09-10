import { NextResponse } from "next/server";

import { UnsupportedImageError } from "@/server/image/png";
import { identifyFrame } from "@/server/services/forensicsService";
import { getSession } from "@/server/session";

/**
 * POST /api/forensics/identify — a PNG in, at most one name out.
 */

/** A 4K lossless frame runs to a few megabytes; 12 MB leaves headroom. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (session?.studioId === undefined) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "Sign in as a studio to use forensics.",
      },
      { status: 401 },
    );
  }

  let file: unknown;
  try {
    const form = await request.formData();
    file = form.get("frame");
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Expected an uploaded image." },
      { status: 400 },
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "bad_request", message: "Attach a PNG frame to identify." },
      { status: 400 },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: "too_large",
        message: `That file is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is 12 MB.`,
      },
      { status: 413 },
    );
  }

  try {
    const png = Buffer.from(await file.arrayBuffer());
    return NextResponse.json(await identifyFrame(png, session.studioId));
  } catch (error) {
    // The reader's own messages say what is wrong with the file and are safe
    // to show. Anything else is ours and the studio learns nothing from it.
    if (error instanceof UnsupportedImageError) {
      return NextResponse.json(
        { error: "unsupported_image", message: error.message },
        { status: 415 },
      );
    }

    console.error("[forensics] identify failed", error);
    return NextResponse.json(
      { error: "identify_failed", message: "Could not read that frame." },
      { status: 500 },
    );
  }
}
