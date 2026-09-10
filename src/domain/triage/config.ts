/**
 * Every tunable number in the triage engine, as a named export.
 *
 * They live here so they can be tuned without touching logic, and so tests can
 * pin them: a test that hardcodes 0.82 silently stops testing the product the
 * day someone retunes the threshold. See SPEC.md §5.3.
 */

/** Signal weights. Must sum to 1. Asserted in tests. */
export const WEIGHTS = {
  lexical: 0.45,
  state: 0.25,
  signature: 0.2,
  environment: 0.1,
} as const;

/**
 * At or above this, a report joins an existing issue.
 *
 * Calibrated against the seed corpus rather than chosen. The originally
 * specified 0.82 assumed a lexical similarity that real writing does not
 * reach: hand-written paraphrases of one bug score a median cosine of
 * 0.08-0.32, while 0.82 demands 0.79. It produced 197 issues from 328
 * reports -- one per report, near enough, which is the product not working.
 *
 * Lowering it costs nothing in precision here, which is the part worth
 * checking: across every threshold from 0.82 down to 0.40, the number of
 * issues mixing two different bugs stays at zero. The discriminating work is
 * done by the scene veto and state proximity, not by the lexical score, so
 * the threshold governs how much wording agreement is demanded on top of
 * "same place, same machine" -- and demanding near-identical wording there
 * only splits one bug into forty.
 *
 * The first mixed issue appears at 0.35. This sits above that.
 */
export const THRESHOLD_ATTACH = 0.4;

/** At or above this but below attach, it is flagged as a possible duplicate. */
export const THRESHOLD_POSSIBLE = 0.25;

/**
 * An exact, non-empty log signature match is very strong evidence, strong
 * enough to carry a report whose wording shares nothing with the issue. When
 * one is found the combined score is floored here rather than replaced, so a
 * report that also matches on wording and place still outranks one that does
 * not.
 */
export const SIGNATURE_MATCH_FLOOR = 0.9;

/** World units per coordinate bucket. */
export const COORD_GRID_SIZE = 5;

/** Fixed state scores, from most to least specific. See SPEC.md §5.2 B. */
export const STATE_SCORES = {
  sameBucket: 1,
  adjacentBucket: 0.6,
  sameScene: 0.3,
  differentScene: 0,
} as const;

/** Below this many characters after normalisation, a report is noise. */
export const NOISE_MIN_LENGTH = 12;

/** A tester repeating themselves byte-for-byte inside this window is noise. */
export const DUPLICATE_WINDOW_MS = 60_000;

/**
 * Severity is impact times spread, not spread alone (SPEC.md §5.5).
 *
 * A single crash that ends the session is CRITICAL. A cosmetic font
 * complaint reported two hundred times is not: frequency measures how
 * widespread an impact is, not whether there is one. So the rules combine a
 * category and keyword judgement about impact with a *share* of the
 * campaign's reports, never a raw count.
 *
 * Share rather than count is what makes these numbers survive a change of
 * scale. The earlier absolute thresholds (15 / 8 / 3) were calibrated against
 * a 40-report fixture; at 400 reports every issue crossed 15 and the whole
 * board turned CRITICAL, which costs the vermilion its meaning.
 *
 * The shares themselves have to be read against the *average* issue share,
 * which is 1/issueCount -- about 7% for a campaign that collapses to fourteen
 * issues. A CRITICAL threshold of 6% would therefore sit below average and
 * mark most of the board critical by construction, which is exactly what the
 * first calibration run did: 9 of 14 issues CRITICAL and not one HIGH,
 * because everything that should have been HIGH cleared 6% instead. These
 * values sit at roughly 1.7x, 1.1x and 0.3x the average share, which puts two
 * issues in red on the seed corpus rather than nine.
 */
export const SEVERITY_SHARES = {
  /** Any issue this widespread is critical whatever its category. */
  critical: 0.12,
  /** A progression blocker needs far less reach to be critical. */
  criticalBlocking: 0.06,
  high: 0.075,
  medium: 0.02,
} as const;

/**
 * Denominator floor for the share calculation.
 *
 * A campaign that has received eight reports is not evidence that anything is
 * widespread. Without this floor the first report into a fresh campaign has a
 * share of 1.0 and every new issue opens CRITICAL, so a studio's first
 * morning of testing would show nothing but red.
 */
export const SEVERITY_MIN_CAMPAIGN = 50;

/**
 * A small English stopword list. Deliberately small: an aggressive list starts
 * eating the words that distinguish one bug report from another.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "then",
  "than",
  "when",
  "while",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "for",
  "with",
  "about",
  "into",
  "from",
  "up",
  "out",
  "over",
  "under",
  "again",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "can",
  "could",
  "should",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "she",
  "it",
  "its",
  "they",
  "them",
  "this",
  "that",
  "these",
  "those",
  "there",
  "here",
  "as",
  "so",
  "just",
  "very",
  "really",
  "also",
  "too",
  "get",
  "got",
  "some",
  "any",
  "no",
  "not",
  "only",
  "even",
  "still",
  "back",
  "like",
  "seems",
  "seem",
  "seemed",
  "think",
  "guess",
  "maybe",
  "kinda",
  "sorta",
]);

/**
 * A light game-domain synonym map. Phrases are collapsed before tokens,
 * because several of them contain stopwords that would otherwise be stripped
 * first ("stuck in" would become "stuck").
 *
 * Light is the operative word. Each entry here is a claim that two words mean
 * the same thing to a developer triaging a build, and every wrong claim merges
 * two real bugs into one.
 */
export const PHRASE_SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  ["fell through", "collision"],
  ["falling through", "collision"],
  ["fall through", "collision"],
  ["stuck in", "collision"],
  ["stuck inside", "collision"],
  ["clipped through", "collision"],
  ["clipping through", "collision"],
  ["stops responding", "crash"],
  ["stopped responding", "crash"],
  ["not responding", "crash"],
  ["stop responding", "crash"],
  ["locked up", "crash"],
  ["hard lock", "crash"],
  ["frame rate", "performance"],
  ["frame drops", "performance"],
  ["frames per second", "performance"],
];

export const TOKEN_SYNONYMS: ReadonlyMap<string, string> = new Map([
  // crash family
  ["crashed", "crash"],
  ["crashes", "crash"],
  ["crashing", "crash"],
  ["froze", "crash"],
  ["frozen", "crash"],
  ["freeze", "crash"],
  ["freezes", "crash"],
  ["freezing", "crash"],
  ["hung", "crash"],
  ["hangs", "crash"],
  ["hang", "crash"],
  ["crashd", "crash"],
  // performance family
  ["fps", "performance"],
  ["framerate", "performance"],
  ["lag", "performance"],
  ["lags", "performance"],
  ["laggy", "performance"],
  ["lagging", "performance"],
  ["stutter", "performance"],
  ["stutters", "performance"],
  ["stuttering", "performance"],
  ["stuttery", "performance"],
  ["slowdown", "performance"],
  ["chugs", "performance"],
  ["chugging", "performance"],
  ["hitching", "performance"],
  ["hitches", "performance"],
  // collision family
  ["clipped", "collision"],
  ["clipping", "collision"],
  ["clips", "collision"],
  ["noclip", "collision"],
  ["collide", "collision"],
  ["collides", "collision"],
  ["colliding", "collision"],
  ["phasing", "collision"],
  // audio family
  ["sound", "audio"],
  ["sounds", "audio"],
  ["music", "audio"],
  ["sfx", "audio"],
  ["volume", "audio"],
  ["muted", "audio"],
  ["silent", "audio"],
  ["silence", "audio"],
]);

/**
 * Tokens that make a report about this product rather than about nothing.
 * Used only by noise detection, and used conservatively: a false noise call
 * costs a real tester signal score, so the list is broad on purpose.
 */
export const DOMAIN_TOKENS: ReadonlySet<string> = new Set([
  "crash",
  "performance",
  "collision",
  "audio",
  "bug",
  "glitch",
  "broken",
  "break",
  "breaks",
  "error",
  "issue",
  "problem",
  "fail",
  "fails",
  "failed",
  "wrong",
  "weird",
  "buggy",
  "stuck",
  "softlock",
  "soflock",
  "respawn",
  "checkpoint",
  "reload",
  "restart",
  "texture",
  "textures",
  "shader",
  "lighting",
  "shadow",
  "shadows",
  "flicker",
  "flickering",
  "flashing",
  "black",
  "white",
  "invisible",
  "missing",
  "render",
  "rendering",
  "artifact",
  "artifacts",
  "screen",
  "camera",
  "fov",
  "menu",
  "ui",
  "hud",
  "button",
  "cursor",
  "inventory",
  "map",
  "subtitle",
  "subtitles",
  "text",
  "font",
  "overlap",
  "overlapping",
  "offscreen",
  "level",
  "scene",
  "room",
  "area",
  "zone",
  "door",
  "wall",
  "floor",
  "ceiling",
  "lift",
  "elevator",
  "platform",
  "ladder",
  "stairs",
  "bridge",
  "gate",
  "enemy",
  "enemies",
  "npc",
  "boss",
  "spawn",
  "spawns",
  "spawning",
  "ai",
  "player",
  "character",
  "animation",
  "jump",
  "jumping",
  "walk",
  "walking",
  "run",
  "running",
  "fall",
  "falling",
  "fell",
  "float",
  "floating",
  "teleport",
  "weapon",
  "gun",
  "item",
  "loot",
  "pickup",
  "chest",
  "quest",
  "objective",
  "save",
  "saves",
  "saving",
  "load",
  "loading",
  "loaded",
  "progress",
  "frame",
  "frames",
  "drop",
  "drops",
  "spike",
  "spikes",
  "freeze",
  "hitch",
  "memory",
  "gpu",
  "cpu",
  "vram",
  "leak",
  "leaking",
  "controller",
  "keyboard",
  "mouse",
  "input",
  "keybind",
  "binding",
  "game",
  "build",
  "version",
  "level",
  "tutorial",
  "multiplayer",
  "server",
  // Words that describe a malfunction without naming a system. Broad on
  // purpose: of the two ways to be wrong here, throwing away a real report is
  // the one that costs a tester money and standing, so it errs towards
  // keeping. A stray non-report becomes one LOW singleton, dismissed in a
  // click.
  "flash",
  "dark",
  "bright",
  "solid",
  "edge",
  "ground",
  "gap",
  "hole",
  "void",
  "crawl",
  "slow",
  "fast",
  "twice",
  "never",
  "always",
  "cover",
  "occupy",
  "hidden",
  "behind",
  "under",
  "above",
  "inside",
  "outside",
  "base",
  "unplayable",
  "unresponsive",
  "die",
  "dead",
  "kill",
  "reset",
  "repeat",
  "reproduce",
  "trigger",
  "activate",
  "unlock",
  "locked",
  "shut",
  "open",
  "close",
  "interact",
  "press",
  "click",
  "select",
  "move",
  "walk",
  "ride",
  "climb",
  "caption",
  "readout",
  "space",
  "great",
  "minute",
  "hour",
]);

/**
 * Progression blockers. Matched against the normalised body, so they are
 * written the way normalise() leaves them: no apostrophes, no punctuation.
 */
export const PROGRESSION_KEYWORDS: readonly string[] = [
  "cant continue",
  "cannot continue",
  "cant progress",
  "cannot progress",
  "cant proceed",
  "softlock",
  "soft lock",
  "stuck forever",
  "stuck permanently",
  "had to restart",
  "have to restart",
  "unplayable",
  "game over permanently",
  "cant finish",
  "cannot finish",
  "blocks progress",
  "no way out",
];
