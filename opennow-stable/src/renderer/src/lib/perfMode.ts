// Performance mode — decides how much visual effect budget the UI may spend.
//
// "low" disables shader atmosphere, backdrop blur, poster hover zoom and card
// glow. Those are the four things that dominate compositor time on integrated
// graphics (office laptops), which is exactly where scroll jank shows up.

export type PerfMode = "auto" | "high" | "low";

const PERF_MODE_KEY = "opennow_perf_mode_v1";

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

/** Heuristic: is this a weak machine? */
export function detectLowEndDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as NavigatorWithHints;

  // <= 4 GB RAM is a strong signal on Windows office machines.
  const memory = nav.deviceMemory;
  if (typeof memory === "number" && memory > 0 && memory <= 4) return true;

  // <= 4 logical cores.
  const cores = nav.hardwareConcurrency;
  if (typeof cores === "number" && cores > 0 && cores <= 4) return true;

  // Honour the OS reduced-motion preference.
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    } catch {
      /* ignore */
    }
  }

  return false;
}

export function getStoredPerfMode(): PerfMode {
  try {
    const raw = localStorage.getItem(PERF_MODE_KEY);
    if (raw === "low" || raw === "high" || raw === "auto") return raw;
  } catch {
    /* ignore */
  }
  return "auto";
}

export function setPerfMode(mode: PerfMode): void {
  try {
    localStorage.setItem(PERF_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
  applyPerfMode();
}

/** Resolves "auto" against the hardware heuristic. */
export function resolvePerfMode(mode: PerfMode = getStoredPerfMode()): "high" | "low" {
  if (mode === "low") return "low";
  if (mode === "high") return "high";
  return detectLowEndDevice() ? "low" : "high";
}

/** Writes data-perf-mode on <html> so CSS can react. */
export function applyPerfMode(): "high" | "low" {
  const resolved = resolvePerfMode();
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-perf-mode", resolved);
  }
  return resolved;
}

export function isLowPerfMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-perf-mode") === "low";
}
