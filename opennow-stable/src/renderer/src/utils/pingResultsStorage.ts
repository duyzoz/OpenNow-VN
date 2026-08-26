const REGION_PING_RESULTS_STORAGE_KEY = "opennow.ping-results.v1";
const PRINTEDWASTE_PING_RESULTS_STORAGE_KEY = "opennow.printedwaste-pings.v1";

export const PING_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
// The main-process probe times out at 1800 ms; anything above this is not a
// usable latency sample and must be treated as unavailable instead of "poor".
export const MAX_VALID_PING_MS = 1800;

function normalizeCachedPingMs(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_VALID_PING_MS) {
    return undefined;
  }
  return Math.round(value);
}

interface PingCacheEntry {
  url: string;
  pingMs: number | null;
}

interface PingCacheEnvelope {
  version: 2;
  savedAtMs: number;
  entries: PingCacheEntry[];
}

export interface PingCacheSnapshot {
  results: Map<string, number | null>;
  savedAtMs: number | null;
}

function loadPingSnapshot(storageKey: string, fallback: PingCacheSnapshot): PingCacheSnapshot {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    const entries = Array.isArray(parsed)
      ? parsed as PingCacheEntry[]
      : parsed && typeof parsed === "object" && "entries" in parsed && Array.isArray(parsed.entries)
      ? parsed.entries as PingCacheEntry[]
      : null;
    if (!entries) return fallback;

    const results = new Map<string, number | null>();
    for (const entry of entries) {
      if (entry && typeof entry.url === "string") {
        const pingMs = normalizeCachedPingMs(entry.pingMs);
        if (pingMs !== undefined) results.set(entry.url, pingMs);
      }
    }
    const savedAtMs = !Array.isArray(parsed) && typeof parsed === "object" && parsed !== null &&
      "savedAtMs" in parsed && typeof parsed.savedAtMs === "number"
      ? parsed.savedAtMs
      : null;
    return { results, savedAtMs };
  } catch {
    return fallback;
  }
}

function savePingResults(storageKey: string, results: Map<string, number | null>): number {
  const savedAtMs = Date.now();
  try {
    const entries: PingCacheEntry[] = [];
    results.forEach((pingMs, url) => {
      const normalizedPingMs = normalizeCachedPingMs(pingMs);
      if (normalizedPingMs !== undefined) entries.push({ url, pingMs: normalizedPingMs });
    });
    const payload: PingCacheEnvelope = { version: 2, savedAtMs, entries };
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
  }
  return savedAtMs;
}

export function loadStoredRegionPingResults(): Map<string, number | null> | null {
  const snapshot = loadPingSnapshot(REGION_PING_RESULTS_STORAGE_KEY, { results: new Map(), savedAtMs: null });
  return snapshot.results.size > 0 ? snapshot.results : null;
}

export function saveStoredRegionPingResults(results: Map<string, number | null>): void {
  savePingResults(REGION_PING_RESULTS_STORAGE_KEY, results);
}

export function clearStoredRegionPingResults(): void {
  try {
    window.sessionStorage.removeItem(REGION_PING_RESULTS_STORAGE_KEY);
  } catch {
  }
}

export function loadStoredPrintedWastePingResults(): Map<string, number | null> {
  return loadPingSnapshot(PRINTEDWASTE_PING_RESULTS_STORAGE_KEY, { results: new Map(), savedAtMs: null }).results;
}

export function loadStoredPrintedWastePingSnapshot(): PingCacheSnapshot {
  return loadPingSnapshot(PRINTEDWASTE_PING_RESULTS_STORAGE_KEY, { results: new Map(), savedAtMs: null });
}

export function saveStoredPrintedWastePingResults(results: Map<string, number | null>): number {
  return savePingResults(PRINTEDWASTE_PING_RESULTS_STORAGE_KEY, results);
}
