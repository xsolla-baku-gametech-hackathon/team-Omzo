/**
 * Pure input sanitization and XSS / injection defense engine.
 *
 * Implements strict defense-in-depth across report bodies, titles, usernames,
 * and console log signatures without external DOM dependencies (domain purity).
 */

const DANGEROUS_PATTERNS: ReadonlyArray<RegExp> = [
  /<script[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /data:\s*text\/html/gi,
  /on\w+\s*=/gi, // onerror=, onload=, onclick=
];

const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Strips null bytes, non-printable control characters, and dangerous HTML/JS vectors.
 */
export function sanitizeText(raw: string, maxLength: number = 4000): string {
  if (typeof raw !== "string") return "";

  let cleaned = raw.replace(CONTROL_CHARS_REGEX, "");

  for (const pattern of DANGEROUS_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Replace raw angle brackets with HTML entities to neutralize any nested tag injection
  cleaned = cleaned.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }

  return cleaned.trim();
}

/**
 * Sanitizes a single console log line or stack trace snippet.
 */
export function sanitizeLogLine(
  line: string,
  maxLength: number = 1000,
): string {
  if (typeof line !== "string") return "";
  return sanitizeText(line, maxLength);
}

/**
 * Cleans username / display names: disallows control chars, collapses whitespace, trims.
 */
export function sanitizeUsername(name: string): string {
  if (typeof name !== "string") return "";
  return name
    .replace(CONTROL_CHARS_REGEX, "")
    .replace(/[<>"'/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/**
 * Sanitizes game scene or level identifiers (alphanumeric, underscores, dashes, dots).
 */
export function sanitizeSceneId(scene: string): string {
  if (typeof scene !== "string") return "unknown";
  const cleaned = scene.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 120);
  return cleaned || "unknown";
}
