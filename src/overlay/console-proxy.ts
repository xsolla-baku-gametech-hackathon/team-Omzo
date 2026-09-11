/**
 * Lightweight console proxy that captures the last N lines (§7).
 *
 * Installed once at overlay load. Intercepts console.log, .warn, .error,
 * .info, and .debug, stores them in a ring buffer, and forwards to the
 * original so the DevTools console remains unaffected.
 *
 * The ring buffer never grows past `MAX_LINES`. Older entries are silently
 * dropped so the proxy cannot become a memory leak on a long session.
 */

const MAX_LINES = 50;

export interface ConsoleEntry {
  readonly level: "log" | "warn" | "error" | "info" | "debug";
  readonly message: string;
  readonly timestamp: number;
}

const buffer: ConsoleEntry[] = [];

function stringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

type Level = ConsoleEntry["level"];

const originals: Record<Level, (...args: unknown[]) => void> = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

let installed = false;

export function installConsoleProxy(): void {
  if (installed) return;
  installed = true;

  const levels: Level[] = ["log", "warn", "error", "info", "debug"];

  for (const level of levels) {
    const original = originals[level];
    console[level] = (...args: unknown[]) => {
      const entry: ConsoleEntry = {
        level,
        message: stringify(args).slice(0, 2000),
        timestamp: Date.now(),
      };
      buffer.push(entry);
      if (buffer.length > MAX_LINES) {
        buffer.shift();
      }
      original(...args);
    };
  }
}

export function getConsoleTail(): string[] {
  return buffer.map((e) => `[${e.level}] ${e.message}`);
}
