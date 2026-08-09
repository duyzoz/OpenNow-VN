/**
 * Read-only accessor for the real playtime store written by `usePlaytime`.
 *
 * WHY A SEPARATE MODULE
 * ---------------------
 * `usePlaytime` lives in App.tsx and its data was never threaded down to the game
 * detail panel, so the panel could only show a favourites-local "session count"
 * that had nothing to do with actual play. This module reads the exact same
 * localStorage key that `usePlaytime` writes, so the numbers shown in the detail
 * panel are the genuine per-session figures: a session is counted when a stream
 * starts, and its duration is added when the user ends that session.
 *
 * It is cached in memory and invalidated on the `storage` event plus an explicit
 * bump, so opening a game card never re-parses the whole JSON blob.
 */

const STORAGE_KEY = "opennow:playtime";

export interface PlaytimeStat {
  totalSeconds: number;
  sessionCount: number;
  lastPlayedAt: string | null;
}

type RawStore = Record<string, Partial<PlaytimeStat>>;

const EMPTY: PlaytimeStat = { totalSeconds: 0, sessionCount: 0, lastPlayedAt: null };

let cache: RawStore | null = null;

function readStore(): RawStore {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cache = parsed && typeof parsed === "object" ? (parsed as RawStore) : {};
  } catch {
    cache = {};
  }
  return cache;
}

/** Force the next read to re-parse (call after a session ends). */
export function invalidatePlaytimeCache(): void {
  cache = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) invalidatePlaytimeCache();
  });
}

export function getPlaytimeStat(gameId: string): PlaytimeStat {
  const record = readStore()[gameId];
  if (!record) return EMPTY;
  return {
    totalSeconds: Math.max(0, Number(record.totalSeconds) || 0),
    sessionCount: Math.max(0, Number(record.sessionCount) || 0),
    lastPlayedAt: typeof record.lastPlayedAt === "string" ? record.lastPlayedAt : null,
  };
}

/** Aggregate across every game the user has ever streamed. */
export function getTotalPlaytimeStat(): PlaytimeStat {
  let totalSeconds = 0;
  let sessionCount = 0;
  let lastPlayedAt: string | null = null;

  for (const record of Object.values(readStore())) {
    totalSeconds += Math.max(0, Number(record?.totalSeconds) || 0);
    sessionCount += Math.max(0, Number(record?.sessionCount) || 0);
    const played = typeof record?.lastPlayedAt === "string" ? record.lastPlayedAt : null;
    if (played && (!lastPlayedAt || played > lastPlayedAt)) lastPlayedAt = played;
  }

  return { totalSeconds, sessionCount, lastPlayedAt };
}

/**
 * Human duration. Keeps counting into the hundreds/thousands of hours rather than
 * rolling over into days, which is what the user asked for.
 */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe === 0) return "0s";

  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  // Show every unit that is actually non-zero so a running session visibly
  // ticks second by second instead of sitting on a rounded minute value.
  if (hours > 0) return `${hours.toLocaleString()}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatLastPlayed(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMs < 3_600_000) return "Just now";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}
