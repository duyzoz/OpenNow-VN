import { app } from "electron";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Persistent appId -> { title, imageUrl } cache.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Discord status monitor polls `getActiveSessions()` in the background. That
 * GFN payload only carries a numeric `appId` -- it has no human readable title.
 * The previous implementation fell back to `activeSession.appId.toString()`,
 * which is why Discord showed "103053062" instead of "Wuthering Waves".
 *
 * The renderer *does* know every title (it owns the catalog), and it always sends
 * the real title through DISCORD_SET_ACTIVITY when a launch starts. We record
 * every title we ever see here and persist it to disk, so the monitor can resolve
 * a name for any of the thousands of catalog games -- including on a cold start
 * where a session from a previous run is still alive.
 */

interface CachedGame {
  title: string;
  imageUrl?: string;
}

const MAX_ENTRIES = 8000;

let cache: Map<string, CachedGame> | null = null;
let flushTimer: NodeJS.Timeout | null = null;
let cachePath: string | null = null;

function getCachePath(): string | null {
  if (cachePath) return cachePath;
  try {
    cachePath = join(app.getPath("userData"), "game-title-cache.json");
    return cachePath;
  } catch {
    // app may not be ready yet; caller falls back to memory-only mode.
    return null;
  }
}

function load(): Map<string, CachedGame> {
  if (cache) return cache;
  cache = new Map();

  const path = getCachePath();
  if (!path) return cache;

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (parsed && typeof parsed === "object") {
      for (const [appId, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!value || typeof value !== "object") continue;
        const title = (value as CachedGame).title;
        if (typeof title !== "string" || title.trim().length === 0) continue;
        const imageUrl = (value as CachedGame).imageUrl;
        cache.set(appId, {
          title,
          imageUrl: typeof imageUrl === "string" && imageUrl.length > 0 ? imageUrl : undefined,
        });
      }
    }
  } catch {
    // Missing or corrupt cache is not an error -- we simply start empty.
  }

  return cache;
}

function scheduleFlush(): void {
  if (flushTimer) return;
  // Debounced + unref'd so cache writes never block quit or keep the loop alive.
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushGameTitleCache();
  }, 4000);
  flushTimer.unref?.();
}

export function flushGameTitleCache(): void {
  const path = getCachePath();
  if (!path || !cache) return;

  try {
    const record: Record<string, CachedGame> = {};
    for (const [appId, value] of cache) record[appId] = value;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(record), "utf8");
  } catch (error) {
    console.warn("[GameTitleCache] Failed to persist:", (error as Error).message);
  }
}

/** Record a title we learned from the renderer. Safe to call on every activity update. */
export function rememberGameTitle(
  appId: string | number | undefined,
  title: string | undefined,
  imageUrl?: string,
): void {
  const key = normalizeAppId(appId);
  const cleanTitle = title?.trim();
  if (!key || !cleanTitle || isNumericLike(cleanTitle)) {
    return;
  }

  const store = load();
  const existing = store.get(key);
  const nextImage = imageUrl?.trim() || existing?.imageUrl;
  if (existing && existing.title === cleanTitle && existing.imageUrl === nextImage) {
    return;
  }

  if (!existing && store.size >= MAX_ENTRIES) {
    // Simple FIFO trim so the file can never grow without bound.
    const oldest = store.keys().next();
    if (!oldest.done) store.delete(oldest.value);
  }

  store.set(key, { title: cleanTitle, imageUrl: nextImage });
  scheduleFlush();
}

/** Bulk-import the renderer catalog (appId -> title). */
export function rememberGameTitles(
  entries: Array<{ appId: string | number; title: string; imageUrl?: string }>,
): void {
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    rememberGameTitle(entry?.appId, entry?.title, entry?.imageUrl);
  }
}

export function lookupGameTitle(appId: string | number | undefined): string | undefined {
  const key = normalizeAppId(appId);
  return key ? load().get(key)?.title : undefined;
}

export function lookupGameImageUrl(appId: string | number | undefined): string | undefined {
  const key = normalizeAppId(appId);
  return key ? load().get(key)?.imageUrl : undefined;
}

function normalizeAppId(appId: string | number | undefined): string | null {
  if (appId === undefined || appId === null) return null;
  const key = String(appId).trim();
  return key.length > 0 ? key : null;
}

function isNumericLike(value: string): boolean {
  return /^\d+$/.test(value);
}
