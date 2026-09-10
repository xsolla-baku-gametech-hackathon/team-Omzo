import type { IssueCategory } from "./types";

/**
 * A deterministic category, decided from the tokens alone.
 *
 * §5.6 lets the LLM refine this later, which means there has to be something
 * to refine: the board must look identical with no API key. Severity also
 * depends on CRASH, so this cannot be the optional step.
 */

const VISUAL = new Set([
  "texture",
  "textures",
  "shader",
  "lighting",
  "shadow",
  "shadows",
  "flicker",
  "flickering",
  "flashing",
  "invisible",
  "render",
  "rendering",
  "artifact",
  "artifacts",
  "black",
  "white",
  "camera",
  "fov",
  "clipping",
]);

const UX = new Set([
  "menu",
  "ui",
  "hud",
  "button",
  "cursor",
  "inventory",
  "subtitle",
  "subtitles",
  "font",
  "tooltip",
  "keybind",
  "binding",
  "overlap",
  "overlapping",
  "offscreen",
]);

/**
 * Ordered, not scored. CRASH first because it outranks everything for
 * severity; GAMEPLAY last because it is the honest default for "something in
 * this game is wrong" rather than a category anything matches into.
 */
export function categorise(tokens: readonly string[]): IssueCategory {
  const set = new Set(tokens);

  if (set.has("crash")) return "CRASH";
  if (set.has("performance")) return "PERFORMANCE";
  if (set.has("audio")) return "AUDIO";
  for (const token of set) if (VISUAL.has(token)) return "VISUAL";
  for (const token of set) if (UX.has(token)) return "UX";
  return "GAMEPLAY";
}
