/**
 * Collect system information from the browser (§7).
 *
 * Gathers: navigator.userAgent, WebGL UNMASKED_RENDERER_WEBGL,
 * deviceMemory, screen size. All access is wrapped — on internal
 * error, falls back to "unknown" rather than crashing the host page.
 */

export interface SystemInfoData {
  readonly os: string;
  readonly browser: string;
  readonly gpuRenderer: string;
  readonly screen: string;
  readonly memoryGb?: number;
}

function detectOS(ua: string): string {
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Unknown OS";
}

function detectBrowser(ua: string): string {
  // Order matters — Chrome UA contains "Safari".
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera/")) return "Opera";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Safari/")) return "Safari";
  return "Unknown Browser";
}

function getGpuRenderer(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "No WebGL";

    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "WebGL (renderer hidden)";

    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
  } catch {
    return "Unknown GPU";
  }
}

export function collectSystemInfo(): SystemInfoData {
  try {
    const ua = navigator.userAgent;
    const mem = (navigator as unknown as Record<string, unknown>).deviceMemory;
    return {
      os: detectOS(ua),
      browser: detectBrowser(ua),
      gpuRenderer: getGpuRenderer(),
      screen: `${typeof screen !== "undefined" ? screen.width : 0}x${typeof screen !== "undefined" ? screen.height : 0}`,
      memoryGb: typeof mem === "number" && mem > 0 ? mem : undefined,
    };
  } catch {
    return {
      os: "Unknown OS",
      browser: "Unknown Browser",
      gpuRenderer: "Unknown GPU",
      screen: "0x0",
    };
  }
}
