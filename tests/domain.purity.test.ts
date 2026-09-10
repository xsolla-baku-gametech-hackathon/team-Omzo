import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The domain/ boundary is the single most important architectural decision in
 * this repo (SPEC.md §3): everything under it is pure functions over plain
 * data, so the interesting logic is testable in milliseconds. A boundary that
 * is only documented erodes on a deadline, so it is asserted here instead.
 */

const DOMAIN_DIR = fileURLToPath(new URL("../src/domain", import.meta.url));

const FORBIDDEN: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /@prisma\/client/, why: "Prisma belongs in server/" },
  { pattern: /^@?\.{0,2}\/?server\//, why: "domain/ may not call server/" },
  { pattern: /^@\/server/, why: "domain/ may not call server/" },
  { pattern: /^@\/app/, why: "domain/ may not import from app/" },
  { pattern: /^react(-dom)?$/, why: "domain/ is not React-aware" },
  { pattern: /^next(\/|$)/, why: "domain/ knows nothing about the framework" },
];

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out = out.concat(walk(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

describe("domain purity", () => {
  it("imports nothing from server/, app/, React, Next or Prisma", () => {
    const violations: string[] = [];

    for (const file of walk(DOMAIN_DIR)) {
      for (const specifier of importsOf(readFileSync(file, "utf8"))) {
        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(specifier)) {
            violations.push(
              `${file.slice(DOMAIN_DIR.length + 1)} imports "${specifier}" — ${why}`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
