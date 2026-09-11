/**
 * ID photo validation for tester registration.
 *
 * Pure sniffing: file type is read from the magic bytes, never trusted
 * from a client-supplied MIME string. Content is not otherwise inspected
 * here -- this only answers "is this a PNG or JPEG within the size limit".
 */

export const MAX_ID_PHOTO_BYTES = 8 * 1024 * 1024;

export type IdPhotoMimeType = "image/png" | "image/jpeg";

export interface IdPhotoResult {
  readonly valid: boolean;
  readonly mimeType?: IdPhotoMimeType;
  readonly reason?: string;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

export function validateIdPhoto(bytes: Uint8Array): IdPhotoResult {
  if (bytes.length === 0) {
    return { valid: false, reason: "Attach a photo of your ID." };
  }
  if (bytes.length > MAX_ID_PHOTO_BYTES) {
    return {
      valid: false,
      reason: `Photo is too large. The limit is ${MAX_ID_PHOTO_BYTES / (1024 * 1024)} MB.`,
    };
  }
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return { valid: true, mimeType: "image/png" };
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return { valid: true, mimeType: "image/jpeg" };
  }
  return { valid: false, reason: "Only PNG or JPEG photos are accepted." };
}
