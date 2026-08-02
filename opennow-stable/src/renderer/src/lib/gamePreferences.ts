// Favorites & session tracking — persisted in localStorage.
//
// PERF: everything is served from an in-memory cache. Previously every single
// GameCard called localStorage.getItem() + JSON.parse() of the whole favorites
// array on mount, which on a 900-game catalog meant ~900 synchronous disk-backed
// reads + parses per page render. That was a major source of scroll jank.
// Now the store is read once, kept in a Set for O(1) lookups, and writes are
// batched/debounced so toggling a heart never blocks the frame.

const FAVORITES_KEY = "opennow_favorites_v1";
const SESSIONS_KEY = "opennow_sessions_v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ── In-memory caches (loaded once) ───────────────────────
let favoriteOrder: string[] = readJson<string[]>(FAVORITES_KEY, []);
let favoriteSet: Set<string> = new Set(favoriteOrder);
let sessionCounts: Record<string, number> = readJson<Record<string, number>>(SESSIONS_KEY, {});

// ── Debounced persistence (never blocks a frame) ─────────
let favFlushHandle: number | null = null;
let sessionFlushHandle: number | null = null;

function scheduleIdle(fn: () => void): number {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === "function") {
    return w.requestIdleCallback(fn, { timeout: 1000 });
  }
  return window.setTimeout(fn, 200);
}

function cancelIdle(handle: number): void {
  const w = window as unknown as { cancelIdleCallback?: (h: number) => void };
  if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(handle);
  else window.clearTimeout(handle);
}

function flushFavorites(): void {
  favFlushHandle = null;
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteOrder));
  } catch {
    /* quota / privacy mode — keep working from memory */
  }
}

function queueFavoriteWrite(): void {
  if (favFlushHandle !== null) cancelIdle(favFlushHandle);
  favFlushHandle = scheduleIdle(flushFavorites);
}

function flushSessions(): void {
  sessionFlushHandle = null;
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessionCounts));
  } catch {
    /* ignore */
  }
}

function queueSessionWrite(): void {
  if (sessionFlushHandle !== null) cancelIdle(sessionFlushHandle);
  sessionFlushHandle = scheduleIdle(flushSessions);
}

// Make sure nothing is lost if the window closes before the idle callback runs.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (favFlushHandle !== null) flushFavorites();
    if (sessionFlushHandle !== null) flushSessions();
  });
}

// ── Subscriptions (so the Favorites page updates live) ───
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToFavorites(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitFavoritesChanged(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* a broken listener must never break the toggle */
    }
  }
}

// useSyncExternalStore needs a stable snapshot reference.
let favoritesSnapshot: string[] = favoriteOrder;

export function getFavoritesSnapshot(): string[] {
  return favoritesSnapshot;
}

function refreshSnapshot(): void {
  favoritesSnapshot = favoriteOrder.slice();
}

// ── Favorites API ────────────────────────────────────────
export function getFavoriteIds(): string[] {
  return favoritesSnapshot;
}

export function getFavoriteCount(): number {
  return favoriteSet.size;
}

/** O(1) — safe to call from inside a render of hundreds of cards. */
export function isFavorite(gameId: string): boolean {
  return favoriteSet.has(gameId);
}

/** Returns the new favorite state (true = added, false = removed). */
export function toggleFavorite(gameId: string): boolean {
  if (favoriteSet.has(gameId)) {
    favoriteSet.delete(gameId);
    const index = favoriteOrder.indexOf(gameId);
    if (index !== -1) favoriteOrder.splice(index, 1);
    refreshSnapshot();
    queueFavoriteWrite();
    emitFavoritesChanged();
    return false;
  }
  favoriteSet.add(gameId);
  favoriteOrder.unshift(gameId); // newest first
  refreshSnapshot();
  queueFavoriteWrite();
  emitFavoritesChanged();
  return true;
}

export function setFavorite(gameId: string, favorite: boolean): boolean {
  if (favorite === favoriteSet.has(gameId)) return favorite;
  return toggleFavorite(gameId);
}

export function clearFavorites(): void {
  favoriteOrder = [];
  favoriteSet = new Set();
  refreshSnapshot();
  queueFavoriteWrite();
  emitFavoritesChanged();
}

// ── Sessions API ─────────────────────────────────────────
export function getSessionCount(gameId: string): number {
  return sessionCounts[gameId] ?? 0;
}

export function incrementSession(gameId: string): void {
  sessionCounts[gameId] = (sessionCounts[gameId] ?? 0) + 1;
  queueSessionWrite();
}

export function getTotalSessions(): number {
  let total = 0;
  for (const value of Object.values(sessionCounts)) total += value;
  return total;
}

/** Most-played game ids, highest first. */
export function getMostPlayedIds(limit = 10): string[] {
  return Object.entries(sessionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
