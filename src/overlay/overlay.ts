/**
 * The in-game overlay (SPEC.md §7).
 *
 * Builds to one standalone script a studio can drop into a WebGL build.
 * Binds F1, renders a small panel over the canvas, captures a canvas-only
 * screenshot, system info, console tail, and game state from
 * `window.__repro.getState()`. One text field, one submit button.
 *
 * Must never crash the host page. Everything is wrapped; on internal error,
 * fail silently and log once.
 */

import { captureCanvas } from "./capture";
import type { CaptureResult } from "./capture";
import { getConsoleTail, installConsoleProxy } from "./console-proxy";
import { collectSystemInfo } from "./system-info";

// ── Types ────────────────────────────────────────────────────────────

interface ReproGameState {
  scene: string;
  x: number;
  y: number;
  z: number;
  playtimeSec: number;
}

interface ReproGlobal {
  getState: () => ReproGameState;
}

declare global {
  interface Window {
    __repro?: ReproGlobal;
  }
}

interface OverlayConfig {
  /** POST endpoint for reports. */
  endpoint: string;
  /** Campaign ID for ingest. */
  campaignId: string;
  /** Reporter ID (user ID from the session). */
  reporterId: string;
}

// ── State ────────────────────────────────────────────────────────────

let overlayEl: HTMLDivElement | null = null;
let isOpen = false;
let config: OverlayConfig | null = null;

// ── Retry queue ──────────────────────────────────────────────────────

interface QueuedReport {
  payload: Record<string, unknown>;
  retries: number;
}

const queue: QueuedReport[] = [];
let flushing = false;

async function flushQueue(): Promise<void> {
  if (flushing || !config) return;
  flushing = true;

  while (queue.length > 0) {
    const item = queue[0];
    try {
      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });
      if (res.ok || res.status === 422) {
        // Success or validation error — drop it either way.
        queue.shift();
      } else if (item.retries >= 5) {
        console.error("[repro] dropping report after 5 retries");
        queue.shift();
      } else {
        item.retries += 1;
        const delay = Math.min(1000 * 2 ** item.retries, 30000);
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch {
      // Offline or network error — retry with backoff.
      if (item.retries >= 5) {
        queue.shift();
      } else {
        item.retries += 1;
        const delay = Math.min(1000 * 2 ** item.retries, 30000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  flushing = false;
}

// ── Game state ───────────────────────────────────────────────────────

function getGameState(): ReproGameState {
  try {
    if (window.__repro?.getState) {
      return window.__repro.getState();
    }
  } catch {
    // fall through
  }
  return { scene: "unknown", x: 0, y: 0, z: 0, playtimeSec: 0 };
}

// ── Overlay DOM ──────────────────────────────────────────────────────

function findCanvas(): HTMLCanvasElement | null {
  // Look for the game canvas specifically, falling back to the first canvas.
  return (
    document.querySelector<HTMLCanvasElement>("canvas[data-repro-game]") ??
    document.querySelector<HTMLCanvasElement>("canvas")
  );
}

function createOverlay(): HTMLDivElement {
  const el = document.createElement("div");
  el.id = "repro-overlay";
  el.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 999999;
    width: 420px;
    max-width: 92vw;
    background: #f1f3f2;
    border: 1px solid #d5dad8;
    border-radius: 4px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    color: #141a18;
    padding: 0;
    display: none;
  `;

  el.innerHTML = `
    <div style="padding: 16px 20px; border-bottom: 1px solid #d5dad8; display: flex; align-items: center; justify-content: space-between;">
      <span style="font-size: 14px; font-weight: 600; letter-spacing: -0.01em;">Report a Bug</span>
      <button id="repro-close" type="button" style="background: none; border: none; cursor: pointer; font-size: 18px; color: #6e7b77; line-height: 1; padding: 2px 6px;">✕</button>
    </div>

    <div id="repro-screenshot-preview" style="padding: 12px 20px 0; display: none;">
      <img id="repro-screenshot-img" style="width: 100%; border-radius: 2px; border: 1px solid #d5dad8;" alt="screenshot" />
    </div>

    <div style="padding: 16px 20px;">
      <label for="repro-body" style="font-size: 13px; color: #6e7b77; display: block; margin-bottom: 6px;">What went wrong?</label>
      <textarea
        id="repro-body"
        rows="3"
        maxlength="4000"
        placeholder="Describe the bug…"
        style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d5dad8; border-radius: 3px; font-size: 15px; line-height: 1.5; font-family: inherit; resize: vertical; background: #fff; color: #141a18; outline: none;"
      ></textarea>
    </div>

    <div style="padding: 0 20px 16px; display: flex; align-items: center; justify-content: space-between;">
      <span id="repro-status" style="font-size: 12px; color: #6e7b77;"></span>
      <button id="repro-submit" type="button" style="padding: 8px 20px; background: #141a18; color: #f1f3f2; border: none; border-radius: 3px; font-size: 13px; font-weight: 500; cursor: pointer;">
        Submit
      </button>
    </div>
  `;

  document.body.appendChild(el);
  return el;
}

let currentScreenshot: CaptureResult | null = null;

export function openOverlay(): void {
  if (!overlayEl) {
    overlayEl = createOverlay();

    overlayEl.querySelector("#repro-close")?.addEventListener("click", () => {
      closeOverlay();
    });

    overlayEl.querySelector("#repro-submit")?.addEventListener("click", () => {
      void submitReport();
    });
  }

  // Capture screenshot immediately on open.
  const canvas = findCanvas();
  if (canvas) {
    const result = captureCanvas(canvas);
    if ("dataUrl" in result) {
      currentScreenshot = result;
      const preview = overlayEl.querySelector("#repro-screenshot-preview") as HTMLElement | null;
      const img = overlayEl.querySelector("#repro-screenshot-img") as HTMLImageElement | null;
      if (preview && img) {
        img.src = result.dataUrl;
        preview.style.display = "block";
      }
    } else {
      currentScreenshot = null;
      setStatus(result.error);
    }
  }

  overlayEl.style.display = "block";
  isOpen = true;

  const body = overlayEl.querySelector("#repro-body") as HTMLTextAreaElement | null;
  body?.focus();
}

export function closeOverlay(): void {
  if (!overlayEl) return;
  overlayEl.style.display = "none";
  isOpen = false;
  currentScreenshot = null;

  const body = overlayEl.querySelector("#repro-body") as HTMLTextAreaElement | null;
  if (body) body.value = "";

  const preview = overlayEl.querySelector("#repro-screenshot-preview") as HTMLElement | null;
  if (preview) preview.style.display = "none";

  setStatus("");
}

export function toggleOverlay(): void {
  if (isOpen) {
    closeOverlay();
  } else {
    openOverlay();
  }
}

function setStatus(msg: string): void {
  const el = overlayEl?.querySelector("#repro-status");
  if (el) el.textContent = msg;
}

async function submitReport(): Promise<void> {
  if (!config) {
    setStatus("Overlay not configured.");
    return;
  }

  const body = (overlayEl?.querySelector("#repro-body") as HTMLTextAreaElement | null)?.value?.trim();
  if (!body) {
    setStatus("Please describe what went wrong.");
    return;
  }

  const gameState = getGameState();
  const systemInfo = collectSystemInfo();
  const consoleTail = getConsoleTail();

  const clientReportId = `cr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const payload: Record<string, unknown> = {
    campaignId: config.campaignId,
    reporterId: config.reporterId,
    body,
    gameState,
    systemInfo,
    consoleTail,
    clientReportId,
  };

  if (currentScreenshot) {
    payload.screenshotData = currentScreenshot.dataUrl;
  }

  // Optimistic confirmation.
  setStatus("Report submitted ✓");
  const bodyEl = overlayEl?.querySelector("#repro-body") as HTMLTextAreaElement | null;
  if (bodyEl) bodyEl.value = "";

  setTimeout(() => closeOverlay(), 800);

  // Queue and flush.
  queue.push({ payload, retries: 0 });
  void flushQueue();
}

// ── Keyboard binding ─────────────────────────────────────────────────

function handleKeydown(e: KeyboardEvent): void {
  // Support F1, tilde/backquote (~ / `), and Shift+R so Mac users without Fn lock can easily open overlay
  const isTrigger =
    e.key === "F1" ||
    e.key === "`" ||
    e.key === "~" ||
    (e.shiftKey && (e.key === "R" || e.key === "r"));

  if (isTrigger) {
    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (activeTag === "textarea" && (e.key === "`" || e.key === "~")) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (isOpen) {
      closeOverlay();
    } else {
      openOverlay();
    }
  }
  if (e.key === "Escape" && isOpen) {
    closeOverlay();
  }
}

// ── Public API ───────────────────────────────────────────────────────

export function initOverlay(opts: OverlayConfig): void {
  try {
    config = opts;
    installConsoleProxy();
    document.addEventListener("keydown", handleKeydown, { capture: true });
  } catch (err) {
    console.error("[repro] overlay init failed", err);
  }
}

export function destroyOverlay(): void {
  try {
    document.removeEventListener("keydown", handleKeydown, { capture: true });
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
    isOpen = false;
    config = null;
  } catch {
    // fail silently
  }
}
