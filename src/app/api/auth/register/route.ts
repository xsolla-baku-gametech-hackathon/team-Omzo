import { NextResponse } from "next/server";
import { z } from "zod";

import {
  parseBirthDateInput,
  validateAdultAge,
  validateLegalName,
} from "@/domain/access/identityRules";
import {
  EmailAlreadyExistsError,
  InvalidContactHandleError,
  InvalidDisplayNameError,
  InvalidIdPhotoError,
  StudioNameRequiredError,
  UnderageRegistrationError,
  WeakPasswordError,
  registerUser,
} from "@/server/services/authService";
import { createSessionToken, setSessionCookie } from "@/server/session";

/** A phone-camera photo of an ID runs to a few MB; 8 MB matches the domain's own cap. */
const MAX_ID_PHOTO_BYTES = 8 * 1024 * 1024;

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  displayName: z.string().min(2).max(100),
  role: z.enum(["TESTER", "STUDIO"]),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD.")
    .or(z.string().datetime({ offset: true })),
  studioName: z.string().min(2).max(100).optional(),
  contactHandle: z.string().max(100).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Body must be multipart form data." },
      { status: 400 },
    );
  }

  const fields = Object.fromEntries(
    Array.from(form.entries()).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const idPhotoField = form.get("idPhoto");
  if (idPhotoField instanceof File && idPhotoField.size > MAX_ID_PHOTO_BYTES) {
    return NextResponse.json(
      {
        error: "id_photo_too_large",
        message: `That photo is ${(idPhotoField.size / 1_048_576).toFixed(1)} MB. The limit is ${MAX_ID_PHOTO_BYTES / 1_048_576} MB.`,
      },
      { status: 413 },
    );
  }
  const idPhoto =
    idPhotoField instanceof File
      ? new Uint8Array(await idPhotoField.arrayBuffer())
      : undefined;

  const parsed = registerSchema.safeParse(fields);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Invalid registration details.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const nameCheck = validateLegalName(parsed.data.displayName);
  if (!nameCheck.valid) {
    return NextResponse.json(
      {
        error: "invalid_display_name",
        message:
          nameCheck.reason ?? "Enter both your first and last name.",
      },
      { status: 422 },
    );
  }

  const birthDate = parseBirthDateInput(parsed.data.birthDate);
  const ageCheck = validateAdultAge(birthDate);
  if (!ageCheck.valid || birthDate == null) {
    return NextResponse.json(
      {
        error: "underage",
        message:
          ageCheck.reason ??
          "You must be at least 18 years old to create an account.",
      },
      { status: 422 },
    );
  }

  try {
    const session = await registerUser({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      birthDate,
      studioName: parsed.data.studioName,
      contactHandle: parsed.data.contactHandle,
      idPhoto,
    });

    const token = await createSessionToken(session);
    await setSessionCookie(token);

    return NextResponse.json(
      {
        user: {
          id: session.sub,
          email: session.email,
          role: session.role,
          displayName: session.displayName,
          studioId: session.studioId,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      return NextResponse.json(
        { error: "email_exists", message: error.message },
        { status: 409 },
      );
    }
    if (error instanceof StudioNameRequiredError) {
      return NextResponse.json(
        { error: "studio_name_required", message: error.message },
        { status: 422 },
      );
    }
    if (error instanceof InvalidDisplayNameError) {
      return NextResponse.json(
        { error: "invalid_display_name", message: error.message },
        { status: 422 },
      );
    }
    if (error instanceof UnderageRegistrationError) {
      return NextResponse.json(
        { error: "underage", message: error.message },
        { status: 422 },
      );
    }
    if (error instanceof InvalidContactHandleError) {
      return NextResponse.json(
        { error: "invalid_contact_handle", message: error.message },
        { status: 422 },
      );
    }
    if (error instanceof InvalidIdPhotoError) {
      return NextResponse.json(
        { error: "invalid_id_photo", message: error.message },
        { status: 422 },
      );
    }
    if (error instanceof WeakPasswordError) {
      return NextResponse.json(
        {
          error: "weak_password",
          message: error.message,
          reasons: error.reasons,
        },
        { status: 422 },
      );
    }

    console.error("[register] unexpected failure", error);
    return NextResponse.json(
      {
        error: "registration_failed",
        message: "Unable to complete registration. Please try again.",
      },
      { status: 500 },
    );
  }
}
