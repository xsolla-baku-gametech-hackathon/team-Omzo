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
  /**
   * Signed build access token, when the overlay is running inside a build
   * served under an access grant. Sent as a bearer credential; the server
   * reads the reporter and the campaign out of its signature.
   *
   * Omitted on our own first-party session page, where the httpOnly session
   * cookie travels with the request instead. There is deliberately no
   * reporter id here: the client does not get to say who it is.
   */
  accessToken?: string;
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
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.accessToken) {
        headers.Authorization = `Bearer ${config.accessToken}`;
      }

      const res = await fetch(config.endpoint, {
        method: "POST",
        headers,
        // Deliberately same-origin, not "include". The cookie still travels
        // on our own session page, which is the only place it would be
        // accepted anyway. "include" would additionally mark cross-origin
        // posts as credentialed, and a credentialed request may not be
        // answered with `Access-Control-Allow-Origin: *` — the browser would
        // discard the response and every third-party build report would look
        // like a network failure.
        credentials: "same-origin",
        body: JSON.stringify(item.payload),
      });
      if (res.ok || res.status === 422) {
        // Success or validation error — drop it either way.
        queue.shift();
      } else if (res.status === 401 || res.status === 403) {
        // Retrying will not mint a credential. Say so rather than looping.
        setStatus("Your session expired. Reopen your access link to report.");
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

/**
 * V2 dark palette — inlined because the overlay runs in the host game's
 * document context and cannot read CSS variables from the Repro stylesheet.
 * When tokens.css changes, update these constants to match.
 *
 * Source: src/styles/tokens.css (UI_SPEC_V2_DARK.md §1)
 */
const OV = {
  bg: "#0F0E15" /* --surface-raised  */,
  bgInput: "#08070C" /* --surface-page    */,
  border: "rgba(255,255,255,0.10)" /* --line-medium  */,
  ink: "#EDEBF2" /* --ink-primary     */,
  inkMuted: "#A19DB0" /* --ink-secondary   */,
  accent: "#8B5CF6" /* --accent          */,
  accentFg: "#EDEBF2" /* --accent-on-fill  */,
  shadow: "0 8px 32px rgba(0,0,0,0.55)",
} as const;

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
    background: ${OV.bg};
    border: 1px solid ${OV.border};
    border-radius: 6px;
    box-shadow: ${OV.shadow};
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    color: ${OV.ink};
    padding: 0;
    display: none;
  `;

  el.innerHTML = `
    <div style="padding: 16px 20px; border-bottom: 1px solid ${OV.border}; display: flex; align-items: center; justify-content: space-between;">
      <span style="font-size: 14px; font-weight: 600; letter-spacing: -0.01em;">Report a Bug</span>
      <button id="repro-close" type="button" style="background: none; border: none; cursor: pointer; font-size: 18px; color: ${OV.inkMuted}; line-height: 1; padding: 2px 6px;">✕</button>
    </div>

    <div id="repro-screenshot-preview" style="padding: 12px 20px 0; display: none;">
      <img id="repro-screenshot-img" style="width: 100%; border-radius: 4px; border: 1px solid ${OV.border};" alt="screenshot" />
    </div>

    <div style="padding: 16px 20px;">
      <label for="repro-body" style="font-size: 13px; color: ${OV.inkMuted}; display: block; margin-bottom: 6px;">What went wrong?</label>
      <textarea
        id="repro-body"
        rows="3"
        maxlength="4000"
        placeholder="Describe the bug…"
        style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid ${OV.border}; border-radius: 4px; font-size: 15px; line-height: 1.5; font-family: inherit; resize: vertical; background: ${OV.bgInput}; color: ${OV.ink}; outline: none;"
      ></textarea>
    </div>

    <div style="padding: 0 20px 16px; display: flex; align-items: center; justify-content: space-between;">
      <span id="repro-status" style="font-size: 12px; color: ${OV.inkMuted};"></span>
      <button id="repro-submit" type="button" style="padding: 8px 20px; background: ${OV.accent}; color: ${OV.accentFg}; border: none; border-radius: 4px; font-size: 13px; font-weight: 500; cursor: pointer;">
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
      const preview = overlayEl.querySelector(
        "#repro-screenshot-preview",
      ) as HTMLElement | null;
      const img = overlayEl.querySelector(
        "#repro-screenshot-img",
      ) as HTMLImageElement | null;
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

  const body = overlayEl.querySelector(
    "#repro-body",
  ) as HTMLTextAreaElement | null;
  body?.focus();
}

export function closeOverlay(): void {
  if (!overlayEl) return;
  overlayEl.style.display = "none";
  isOpen = false;
  currentScreenshot = null;

  const body = overlayEl.querySelector(
    "#repro-body",
  ) as HTMLTextAreaElement | null;
  if (body) body.value = "";

  const preview = overlayEl.querySelector(
    "#repro-screenshot-preview",
  ) as HTMLElement | null;
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

  const body = (
    overlayEl?.querySelector("#repro-body") as HTMLTextAreaElement | null
  )?.value?.trim();
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
  const bodyEl = overlayEl?.querySelector(
    "#repro-body",
  ) as HTMLTextAreaElement | null;
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
