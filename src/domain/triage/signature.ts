import { createHash } from "node:crypto";

/**
 * A stable fingerprint of the error lines in a console tail.
 *
 * Two testers hitting the same broken code path produce the same stack, but
 * never the same text: object ids, coordinates, timings and cuids all differ.
 * Stripping the volatile parts is what turns "similar logs" into an equality
 * check, and an equality check is strong enough evidence to cluster two
 * reports whose wording shares nothing at all (SPEC.md §5.2 C).
 */

const ERROR_LINE =
  /\b(error|uncaught|exception|failed|fatal|typeerror|referenceerror|rangeerror|assertion)\b/i;

const VOLATILE: ReadonlyArray<readonly [RegExp, string]> = [
  // ISO timestamps and clock times, first: they contain digits and colons
  // that the later rules would shred into something less recognisable.
  [/\d{4}-\d{2}-\d{2}t[\d:.]+z?/gi, "<ts>"],
  [/\b\d{1,2}:\d{2}:\d{2}(\.\d+)?\b/g, "<ts>"],
  // cuids and uuids, before the generic hex rule takes a bite out of them
  [/\bc[a-z0-9]{24}\b/gi, "<id>"],
  [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "<id>",
  ],
  [/\b0x[0-9a-f]+\b/gi, "<addr>"],
  // Anything numeric: coordinates, entity ids, frame counts, byte offsets.
  [/-?\d+(\.\d+)?/g, "<n>"],
  [/\s+/g, " "],
];

function stripVolatile(line: string): string {
  let stripped = line.toLowerCase();
  for (const [pattern, replacement] of VOLATILE) {
    stripped = stripped.replace(pattern, replacement);
  }
  return stripped.trim();
}

/**
 * Returns "" when the tail holds no error lines. An empty signature is not
 * evidence of anything and never contributes to a merge -- most reports have
 * a clean console, and treating "both quiet" as a match would cluster the
 * whole campaign into one issue.
 */
export function logSignature(consoleTail: readonly string[]): string {
  const errors = consoleTail
    .filter((line) => ERROR_LINE.test(line))
    .map(stripVolatile)
    .filter((line) => line.length > 0);

  if (errors.length === 0) return "";

  // Sorted and de-duplicated: the same failure can arrive in a different
  // order, or repeat, without being a different failure.
  const canonical = [...new Set(errors)].sort().join("\n");

  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
