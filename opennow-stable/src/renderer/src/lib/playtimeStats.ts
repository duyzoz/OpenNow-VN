/** Read-only accessor for the playtime store used by the remake UX. */

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

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe === 0) return "0s";

  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
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
