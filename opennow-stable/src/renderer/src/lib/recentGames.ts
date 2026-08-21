import type { GameInfo } from "@shared/gfn";

export interface RecentGame {
  game: GameInfo;
  count: number;
  lastAccessedAt: string;
}

const STORAGE_KEY = "opennow.recent-games-v2";
const MAX_RECENT_GAMES = 8;

function isRecentGame(value: unknown): value is RecentGame {
  const item = value as Partial<RecentGame> | null;
  return Boolean(
    item
      && item.game
      && typeof item.game === "object"
      && typeof item.game.id === "string"
      && typeof item.game.title === "string"
      && typeof item.count === "number"
      && typeof item.lastAccessedAt === "string",
  );
}

export function loadRecentGames(): RecentGame[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isRecentGame).slice(0, MAX_RECENT_GAMES) : [];
  } catch {
    return [];
  }
}

function persistRecentGames(items: RecentGame[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private/hardened environments may disable localStorage.
  }
}

export function rememberRecentGame(current: RecentGame[], game: GameInfo): RecentGame[] {
  const existing = current.find((item) => item.game.id === game.id);
  const next: RecentGame[] = [
    {
      game,
      count: (existing?.count ?? 0) + 1,
      lastAccessedAt: new Date().toISOString(),
    },
    ...current.filter((item) => item.game.id !== game.id),
  ].slice(0, MAX_RECENT_GAMES);
  persistRecentGames(next);
  return next;
}

export function clearRecentGames(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
