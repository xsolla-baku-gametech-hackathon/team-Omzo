/**
 * The in-game overlay (SPEC.md §7).
 *
 * Builds to one standalone script a studio can drop into a WebGL build.
 * Binds F1, renders a panel over the canvas, captures a canvas-only
 * screenshot, system info, console tail, and game state from
 * `window.__repro.getState()`.
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
  endpoint: string;
  campaignId: string;
  /**
   * Signed build access token, when the overlay is running inside a build
   * served under an access grant. Sent as a bearer credential; the server
   * reads the reporter and the campaign out of its signature.
   *
   * Omitted on our own first-party session page, where the httpOnly session
   * cookie travels with the request instead.
   */
  accessToken?: string;
}

const TAGS = [
  { id: "crash", label: "Crash", hint: "Hard fail / freeze" },
  { id: "collision", label: "Collision", hint: "Stuck / clipped" },
  { id: "performance", label: "Performance", hint: "FPS / hitch" },
  { id: "audio", label: "Audio", hint: "Sound / music" },
  { id: "visual", label: "Visual", hint: "Art / UI glitch" },
  { id: "other", label: "Other", hint: "Something else" },
] as const;

type TagId = (typeof TAGS)[number]["id"];

// ── State ────────────────────────────────────────────────────────────

let overlayEl: HTMLDivElement | null = null;
let backdropEl: HTMLDivElement | null = null;
let isOpen = false;
let config: OverlayConfig | null = null;
let selectedTag: TagId | null = null;
let styleInjected = false;

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
        credentials: "same-origin",
        body: JSON.stringify(item.payload),
      });
      if (res.ok || res.status === 422) {
        queue.shift();
      } else if (res.status === 401 || res.status === 403) {
        setStatus("Your session expired. Reopen your access link to report.", "error");
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

function formatPlaytime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function findCanvas(): HTMLCanvasElement | null {
  return (
    document.querySelector<HTMLCanvasElement>("canvas[data-repro-game]") ??
    document.querySelector<HTMLCanvasElement>("canvas")
  );
}

/**
 * V2 dark palette — inlined because the overlay runs in the host game's
 * document context and cannot read CSS variables from the Repro stylesheet.
 */
const OV = {
  bg: "#0F0E15",
  bgInput: "#08070C",
  bgSunken: "#050409",
  border: "rgba(255,255,255,0.10)",
  borderSubtle: "rgba(255,255,255,0.06)",
  ink: "#EDEBF2",
  inkMuted: "#A19DB0",
  inkFaint: "#6B6779",
  accent: "#8B5CF6",
  accentHover: "#9D74F8",
  accentWash: "rgba(139,92,246,0.12)",
  accentFg: "#08070C",
  ok: "#3DD9A4",
  okWash: "rgba(61,217,164,0.12)",
  danger: "#FF6B4A",
  shadow: "0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
} as const;

function injectStyles(): void {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const style = document.createElement("style");
  style.id = "repro-overlay-styles";
  style.textContent = `
    @keyframes repro-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes repro-panel-in {
      from { opacity: 0; transform: translate(-50%, calc(-50% + 18px)) scale(0.96); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    @keyframes repro-panel-out {
      from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      to { opacity: 0; transform: translate(-50%, calc(-50% + 10px)) scale(0.98); }
    }
    @keyframes repro-fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes repro-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.55; }
    }
    #repro-backdrop {
      position: fixed; inset: 0; z-index: 999998;
      background: rgba(5,4,9,0.62);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      animation: repro-fade-in 220ms ease-out both;
    }
    #repro-overlay {
      position: fixed; top: 50%; left: 50%; z-index: 999999;
      width: min(460px, 94vw); max-height: min(90vh, 720px);
      display: flex; flex-direction: column;
      background: ${OV.bg};
      border: 1px solid ${OV.border};
      border-radius: 22px;
      box-shadow: ${OV.shadow};
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: ${OV.ink};
      overflow: hidden;
      animation: repro-panel-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    #repro-overlay.repro-closing {
      animation: repro-panel-out 180ms ease-in both;
    }
    #repro-backdrop.repro-closing {
      animation: repro-fade-out 180ms ease-in both;
    }
    #repro-overlay * { box-sizing: border-box; }
    #repro-overlay button { font-family: inherit; }
    #repro-overlay textarea:focus,
    #repro-overlay button:focus-visible {
      outline: 2px solid ${OV.accent};
      outline-offset: 2px;
    }
    .repro-tag {
      border: 1px solid ${OV.border};
      background: ${OV.bgSunken};
      color: ${OV.inkMuted};
      border-radius: 999px;
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 180ms ease, color 180ms ease, border-color 180ms ease, transform 180ms ease;
    }
    .repro-tag:hover { color: ${OV.ink}; border-color: rgba(255,255,255,0.16); }
    .repro-tag[aria-pressed="true"] {
      background: ${OV.accentWash};
      color: ${OV.accentHover};
      border-color: rgba(139,92,246,0.45);
    }
    .repro-tag:active { transform: scale(0.97); }
    .repro-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 10px; border-radius: 999px;
      background: ${OV.bgSunken}; border: 1px solid ${OV.borderSubtle};
      font-size: 11px; color: ${OV.inkMuted}; white-space: nowrap;
    }
    .repro-chip strong { color: ${OV.ink}; font-weight: 600; }
    #repro-submit {
      padding: 10px 18px; background: ${OV.accent}; color: ${OV.accentFg};
      border: none; border-radius: 999px; font-size: 13px; font-weight: 650;
      cursor: pointer; box-shadow: 0 8px 24px rgba(139,92,246,0.35);
      transition: background 160ms ease, transform 160ms ease, opacity 160ms ease;
    }
    #repro-submit:hover { background: ${OV.accentHover}; }
    #repro-submit:active { transform: scale(0.98); }
    #repro-submit:disabled { opacity: 0.45; cursor: default; transform: none; }
    @media (prefers-reduced-motion: reduce) {
      #repro-backdrop, #repro-overlay,
      #repro-backdrop.repro-closing, #repro-overlay.repro-closing {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function createOverlay(): HTMLDivElement {
  injectStyles();

  const backdrop = document.createElement("div");
  backdrop.id = "repro-backdrop";
  backdrop.addEventListener("click", () => closeOverlay());
  document.body.appendChild(backdrop);
  backdropEl = backdrop;

  const el = document.createElement("div");
  el.id = "repro-overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Report a bug");

  el.innerHTML = `
    <div style="padding: 18px 20px 14px; border-bottom: 1px solid ${OV.borderSubtle}; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
      <div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
          <span style="width:8px;height:8px;border-radius:999px;background:${OV.danger};box-shadow:0 0 0 4px rgba(255,107,74,0.15);animation:repro-pulse 1.6s ease infinite;"></span>
          <span style="font-size: 15px; font-weight: 650; letter-spacing: -0.02em;">Report a bug</span>
        </div>
        <p style="margin:0; font-size:12px; color:${OV.inkMuted}; line-height:1.45;">
          Screenshot and session context are attached automatically.
        </p>
      </div>
      <button id="repro-close" type="button" aria-label="Close"
        style="background:${OV.bgSunken}; border:1px solid ${OV.borderSubtle}; cursor:pointer; font-size:14px; color:${OV.inkMuted}; line-height:1; width:32px; height:32px; border-radius:999px;">
        ✕
      </button>
    </div>

    <div id="repro-scroll" style="overflow:auto; flex:1; min-height:0;">
      <div id="repro-screenshot-preview" style="padding: 14px 20px 0; display:none;">
        <div style="position:relative; border-radius:14px; overflow:hidden; border:1px solid ${OV.border}; background:${OV.bgSunken};">
          <img id="repro-screenshot-img" alt="Captured frame" style="display:block; width:100%; max-height:180px; object-fit:cover;" />
          <div style="position:absolute; left:10px; bottom:10px; display:flex; gap:6px; flex-wrap:wrap;">
            <span class="repro-chip" style="background:rgba(8,7,12,0.78); backdrop-filter:blur(8px);">Frame captured</span>
          </div>
        </div>
      </div>

      <div style="padding: 14px 20px 0;">
        <div style="font-size:11px; font-weight:650; letter-spacing:0.06em; text-transform:uppercase; color:${OV.inkFaint}; margin-bottom:8px;">
          Session context
        </div>
        <div id="repro-context" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
      </div>

      <div style="padding: 16px 20px 0;">
        <div style="font-size:11px; font-weight:650; letter-spacing:0.06em; text-transform:uppercase; color:${OV.inkFaint}; margin-bottom:8px;">
          What kind of problem?
        </div>
        <div id="repro-tags" style="display:flex; flex-wrap:wrap; gap:8px;">
          ${TAGS.map(
            (tag) => `
            <button type="button" class="repro-tag" data-tag="${tag.id}" aria-pressed="false" title="${tag.hint}">
              ${tag.label}
            </button>`,
          ).join("")}
        </div>
      </div>

      <div style="padding: 16px 20px 0;">
        <label for="repro-body" style="font-size:11px; font-weight:650; letter-spacing:0.06em; text-transform:uppercase; color:${OV.inkFaint}; display:block; margin-bottom:8px;">
          What went wrong?
        </label>
        <textarea
          id="repro-body"
          rows="4"
          maxlength="4000"
          placeholder="What happened? What did you expect? Steps if you can…"
          style="width:100%; padding:12px 14px; border:1px solid ${OV.border}; border-radius:14px; font-size:14px; line-height:1.5; font-family:inherit; resize:vertical; background:${OV.bgInput}; color:${OV.ink}; min-height:96px;"
        ></textarea>
        <div style="display:flex; justify-content:space-between; margin-top:6px;">
          <span id="repro-hint" style="font-size:11px; color:${OV.inkFaint};">Be specific — triage clusters similar wording.</span>
          <span id="repro-count" style="font-size:11px; font-variant-numeric:tabular-nums; color:${OV.inkFaint};">0 / 4000</span>
        </div>
      </div>

      <div style="padding: 14px 20px 0;">
        <button type="button" id="repro-console-toggle"
          style="width:100%; text-align:left; background:${OV.bgSunken}; border:1px solid ${OV.borderSubtle}; border-radius:14px; padding:10px 12px; color:${OV.inkMuted}; cursor:pointer; font-size:12px; font-weight:600;">
          <span style="display:flex; justify-content:space-between; gap:8px;">
            <span>Console evidence</span>
            <span id="repro-console-count" style="font-family:ui-monospace,Menlo,monospace; color:${OV.inkFaint};">0 lines</span>
          </span>
        </button>
        <pre id="repro-console" hidden
          style="margin:8px 0 0; max-height:110px; overflow:auto; padding:10px 12px; border-radius:12px; background:${OV.bgSunken}; border:1px solid ${OV.borderSubtle}; color:${OV.inkMuted}; font:11px/1.45 ui-monospace,Menlo,monospace; white-space:pre-wrap; word-break:break-word;"></pre>
      </div>
    </div>

    <div style="padding: 14px 20px 18px; border-top: 1px solid ${OV.borderSubtle}; display:flex; align-items:center; justify-content:space-between; gap:12px; background:rgba(8,7,12,0.35);">
      <span id="repro-status" style="font-size:12px; color:${OV.inkMuted}; line-height:1.35; min-height:1.2em;"></span>
      <button id="repro-submit" type="button">Submit report</button>
    </div>
  `;

  document.body.appendChild(el);

  el.querySelector("#repro-close")?.addEventListener("click", () => closeOverlay());
  el.querySelector("#repro-submit")?.addEventListener("click", () => {
    void submitReport();
  });

  el.querySelectorAll<HTMLButtonElement>(".repro-tag").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.tag as TagId;
      selectedTag = selectedTag === id ? null : id;
      el.querySelectorAll<HTMLButtonElement>(".repro-tag").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.tag === selectedTag));
      });
    });
  });

  const body = el.querySelector("#repro-body") as HTMLTextAreaElement | null;
  body?.addEventListener("input", () => updateCharCount());

  el.querySelector("#repro-console-toggle")?.addEventListener("click", () => {
    const pre = el.querySelector("#repro-console") as HTMLElement | null;
    if (!pre) return;
    pre.hidden = !pre.hidden;
  });

  return el;
}

function updateCharCount(): void {
  const body = overlayEl?.querySelector("#repro-body") as HTMLTextAreaElement | null;
  const count = overlayEl?.querySelector("#repro-count");
  if (!body || !count) return;
  count.textContent = `${body.value.length} / 4000`;
}

function renderContext(state: ReproGameState): void {
  const host = overlayEl?.querySelector("#repro-context");
  if (!host) return;

  const system = collectSystemInfo();
  const chips = [
    ["Scene", state.scene || "unknown"],
    ["Playtime", formatPlaytime(state.playtimeSec)],
    ["Position", `${Math.round(state.x)}, ${Math.round(state.y)}, ${Math.round(state.z)}`],
    ["Browser", system.browser || "unknown"],
    ["GPU", shorten(system.gpuRenderer || "unknown", 28)],
  ];

  host.innerHTML = chips
    .map(
      ([label, value]) =>
        `<span class="repro-chip"><span>${label}</span><strong>${escapeHtml(value)}</strong></span>`,
    )
    .join("");
}

function renderConsolePreview(): void {
  const lines = getConsoleTail().slice(-12);
  const pre = overlayEl?.querySelector("#repro-console") as HTMLElement | null;
  const count = overlayEl?.querySelector("#repro-console-count");
  if (count) count.textContent = `${lines.length} line${lines.length === 1 ? "" : "s"}`;
  if (pre) {
    pre.textContent =
      lines.length > 0
        ? lines.join("\n")
        : "No console output captured yet.";
  }
}

function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let currentScreenshot: CaptureResult | null = null;

export function openOverlay(): void {
  if (!overlayEl) {
    overlayEl = createOverlay();
  } else if (backdropEl && !document.body.contains(backdropEl)) {
    document.body.appendChild(backdropEl);
  }

  backdropEl?.classList.remove("repro-closing");
  overlayEl.classList.remove("repro-closing");
  if (backdropEl) backdropEl.style.display = "block";

  selectedTag = null;
  overlayEl.querySelectorAll<HTMLButtonElement>(".repro-tag").forEach((b) => {
    b.setAttribute("aria-pressed", "false");
  });

  const state = getGameState();
  renderContext(state);
  renderConsolePreview();

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
      setStatus(result.error, "error");
    }
  }

  overlayEl.style.display = "flex";
  isOpen = true;
  updateCharCount();
  setStatus("Ready to send · ~ / F1 to toggle", "muted");

  const body = overlayEl.querySelector("#repro-body") as HTMLTextAreaElement | null;
  body?.focus();
}

export function closeOverlay(): void {
  if (!overlayEl || !isOpen) return;

  const finish = () => {
    if (overlayEl) overlayEl.style.display = "none";
    if (backdropEl) backdropEl.style.display = "none";
    overlayEl?.classList.remove("repro-closing");
    backdropEl?.classList.remove("repro-closing");
    isOpen = false;
    currentScreenshot = null;
    selectedTag = null;

    const body = overlayEl?.querySelector("#repro-body") as HTMLTextAreaElement | null;
    if (body) body.value = "";

    const preview = overlayEl?.querySelector(
      "#repro-screenshot-preview",
    ) as HTMLElement | null;
    if (preview) preview.style.display = "none";

    const consolePre = overlayEl?.querySelector("#repro-console") as HTMLElement | null;
    if (consolePre) consolePre.hidden = true;

    setStatus("");
  };

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced) {
    finish();
    return;
  }

  overlayEl.classList.add("repro-closing");
  backdropEl?.classList.add("repro-closing");
  window.setTimeout(finish, 170);
}

export function toggleOverlay(): void {
  if (isOpen) {
    closeOverlay();
  } else {
    openOverlay();
  }
}

function setStatus(msg: string, tone: "muted" | "ok" | "error" = "muted"): void {
  const el = overlayEl?.querySelector("#repro-status") as HTMLElement | null;
  if (!el) return;
  el.textContent = msg;
  el.style.color =
    tone === "ok" ? OV.ok : tone === "error" ? OV.danger : OV.inkMuted;
}

async function submitReport(): Promise<void> {
  if (!config) {
    setStatus("Overlay not configured.", "error");
    return;
  }

  const bodyEl = overlayEl?.querySelector(
    "#repro-body",
  ) as HTMLTextAreaElement | null;
  const raw = bodyEl?.value?.trim() ?? "";
  if (!raw) {
    setStatus("Please describe what went wrong.", "error");
    bodyEl?.focus();
    return;
  }

  const tag = TAGS.find((t) => t.id === selectedTag);
  const body = tag ? `[${tag.label}] ${raw}` : raw;

  const submitBtn = overlayEl?.querySelector(
    "#repro-submit",
  ) as HTMLButtonElement | null;
  if (submitBtn) submitBtn.disabled = true;

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

  setStatus("Sending report…", "muted");

  queue.push({ payload, retries: 0 });
  void flushQueue();

  setStatus("Report queued · attached to triage", "ok");
  if (bodyEl) bodyEl.value = "";
  selectedTag = null;
  overlayEl
    ?.querySelectorAll<HTMLButtonElement>(".repro-tag")
    .forEach((b) => b.setAttribute("aria-pressed", "false"));
  updateCharCount();

  window.setTimeout(() => {
    if (submitBtn) submitBtn.disabled = false;
    closeOverlay();
  }, 900);
}

// ── Keyboard binding ─────────────────────────────────────────────────

function handleKeydown(e: KeyboardEvent): void {
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
    if (backdropEl) {
      backdropEl.remove();
      backdropEl = null;
    }
    isOpen = false;
    config = null;
    currentScreenshot = null;
    selectedTag = null;
  } catch {
    // fail silently
  }
}
