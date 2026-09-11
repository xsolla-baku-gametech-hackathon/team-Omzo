/**
 * Pure Game Engine Stack Trace Normalizer & Crash Fingerprinter.
 *
 * Parses and normalizes callstacks from Unity, Unreal Engine HTML5,
 * Godot Web, Emscripten/WASM, and standard browser engines.
 * Replaces ephemeral memory addresses, function hashes, and dynamic
 * line offsets to produce robust, deterministic crash signatures.
 */

export interface StackFrame {
  readonly functionName: string;
  readonly fileName: string;
  readonly lineNumber?: number;
}

export interface NormalizedCrash {
  readonly engine:
    "UNITY" | "UNREAL" | "GODOT" | "BROWSER" | "WASM" | "UNKNOWN";
  readonly topFrame?: StackFrame;
  readonly signature: string;
  readonly framesCount: number;
}

const HEX_ADDRESS_REGEX = /0x[0-9a-fA-F]+/g;
const WASM_FUNC_REGEX = /wasm-function\[\d+\]/g;
const GUID_HASH_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Detects the originating game engine from callstack signatures.
 */
export function detectGameEngine(trace: string): NormalizedCrash["engine"] {
  const lower = trace.toLowerCase();
  if (
    lower.includes("unity") ||
    lower.includes("unityloader") ||
    lower.includes("il2cpp")
  ) {
    return "UNITY";
  }
  if (
    lower.includes("unreal") ||
    lower.includes("ue4") ||
    lower.includes("ue5") ||
    lower.includes("fengine")
  ) {
    return "UNREAL";
  }
  if (lower.includes("godot")) {
    return "GODOT";
  }
  if (lower.includes("wasm-function") || lower.includes(".wasm")) {
    return "WASM";
  }
  if (
    lower.includes("typeerror:") ||
    lower.includes("referenceerror:") ||
    lower.includes("at ")
  ) {
    return "BROWSER";
  }
  return "UNKNOWN";
}

/**
 * Normalizes a callstack line into a canonical representation.
 */
export function normalizeStackLine(line: string): string {
  return line
    .trim()
    .replace(HEX_ADDRESS_REGEX, "<ADDR>")
    .replace(WASM_FUNC_REGEX, "<WASM_FN>")
    .replace(GUID_HASH_REGEX, "<GUID>")
    .replace(/\b\d{4,}\b/g, "<NUM>") // Replace high numeric offsets
    .replace(/\s+/g, " ");
}

/**
 * Parses a multiline error/stack trace and builds a canonical crash fingerprint.
 */
export function parseStackTrace(rawTrace: string): NormalizedCrash {
  if (!rawTrace || typeof rawTrace !== "string") {
    return {
      engine: "UNKNOWN",
      signature: "EMPTY_TRACE",
      framesCount: 0,
    };
  }

  const engine = detectGameEngine(rawTrace);
  const lines = rawTrace
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const normalizedLines: string[] = [];
  let topFrame: StackFrame | undefined;

  for (const line of lines) {
    // Try to extract V8/WebKit/Firefox frame: "at FunctionName (path/file.js:12:34)"
    const match = line.match(/^at\s+([^(]+?)\s*\(([^:]+):?(\d+)?/i);
    if (match) {
      const func = match[1]?.trim() ?? "anonymous";
      const file = match[2]?.split("/").pop() ?? "unknown";
      const lineNum = match[3] ? parseInt(match[3], 10) : undefined;

      if (!topFrame) {
        topFrame = { functionName: func, fileName: file, lineNumber: lineNum };
      }
    }

    normalizedLines.push(normalizeStackLine(line));
  }

  // Create signature from top 3 normalized frames
  const sigParts = normalizedLines
    .slice(0, 3)
    .map((l) => l.replace(/^at\s+/i, ""));
  const signature =
    sigParts.length > 0
      ? `${engine}:${sigParts.join(" -> ")}`
      : `${engine}:NO_FRAMES`;

  return {
    engine,
    topFrame,
    signature,
    framesCount: normalizedLines.length,
  };
}
