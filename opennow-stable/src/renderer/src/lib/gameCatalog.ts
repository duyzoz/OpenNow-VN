import type { GameInfo, GameVariant } from "@shared/gfn";

export type PlaytimeData = Record<string, { lastPlayedAt?: string | null; totalSeconds?: number; sessionCount?: number }>;

export function isNumericId(value: string | undefined): value is string {
  if (!value) return false;
  return /^\d+$/.test(value);
}

export function parseNumericId(value: string | undefined): number | null {
  if (!isNumericId(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function defaultVariantId(game: GameInfo): string {
  return game.variants[game.selectedVariantIndex]?.id ?? game.variants[0]?.id ?? game.id;
}

export function getSelectedVariant(game: GameInfo, variantId: string): GameVariant | undefined {
  return game.variants.find((variant) => variant.id === variantId) ?? game.variants[0];
}

export function findSessionContextForAppId(
  catalog: GameInfo[],
  variantByGameId: Record<string, string>,
  appId: number,
): { game: GameInfo; variant?: GameVariant } | null {
  for (const game of catalog) {
    const matchedVariant = game.variants.find((variant) => parseNumericId(variant.id) === appId);
    if (matchedVariant) {
      return { game, variant: matchedVariant };
    }

    if (parseNumericId(game.launchAppId) === appId) {
      const preferredVariantId = variantByGameId[game.id] ?? defaultVariantId(game);
      return {
        game,
        variant: getSelectedVariant(game, preferredVariantId),
      };
    }
  }

  return null;
}

export function matchesGameSearch(game: GameInfo, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (game.searchText?.toLowerCase().includes(normalizedQuery)) return true;
  return [
    game.title,
    game.description,
    game.publisherName,
    ...(game.genres ?? []),
    ...(game.featureLabels ?? []),
    ...(game.availableStores ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

/** Rank already-loaded catalog items without refetching or rebuilding server data. */
export function getGameSearchSuggestions(
  games: GameInfo[],
  query: string,
  limit = 30,
): GameInfo[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || limit <= 0) return [];

  return games
    .map((game, index) => {
      const title = game.title.trim().toLowerCase();
      const words = title.split(/[^a-z0-9\u00c0-\u024f]+/i).filter(Boolean);
      const titleIndex = title.indexOf(normalizedQuery);
      let score = Number.POSITIVE_INFINITY;
      if (title === normalizedQuery) score = 0;
      else if (title.startsWith(normalizedQuery)) score = 1;
      else if (words.some((word) => word.startsWith(normalizedQuery))) score = 2;
      else if (titleIndex >= 0) score = 3 + titleIndex / 1000;
      else if (game.searchText?.toLowerCase().includes(normalizedQuery)) score = 5;
      else if (matchesGameSearch(game, normalizedQuery)) score = 6;
      return { game, score, index };
    })
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => (
      left.score - right.score
      || left.game.title.localeCompare(right.game.title)
      || left.index - right.index
    ))
    .slice(0, limit)
    .map(({ game }) => game);
}

export function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length != right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

export function sortLibraryGames(
  games: GameInfo[],
  sortId: string,
  playtimeData: PlaytimeData,
): GameInfo[] {
  const copy = [...games];
  const compareTitle = (left: GameInfo, right: GameInfo) => left.title.localeCompare(right.title);
  const playtimeLastPlayedMs = (gameId: string): number => {
    const raw = playtimeData[gameId]?.lastPlayedAt;
    if (!raw) return 0;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : 0;
  };
  const legacyLastPlayedMs = (game: GameInfo): number => {
    if (!game.lastPlayed) return 0;
    const ms = Date.parse(game.lastPlayed);
    return Number.isFinite(ms) ? ms : 0;
  };
  if (sortId === "z_to_a") {
    return copy.sort((left, right) => right.title.localeCompare(left.title));
  }
  if (sortId === "a_to_z") {
    return copy.sort(compareTitle);
  }
  if (sortId === "last_played") {
    return copy
      .map((game) => ({
        game,
        lastPlayedMs: playtimeLastPlayedMs(game.id) || legacyLastPlayedMs(game),
      }))
      .sort((left, right) => (
        left.lastPlayedMs === right.lastPlayedMs
          ? compareTitle(left.game, right.game)
          : right.lastPlayedMs - left.lastPlayedMs
      ))
      .map(({ game }) => game);
  }
  if (sortId === "last_added") {
    // Preserve server-provided order. We do not currently have a trustworthy local "addedAt" field.
    return copy;
  }
  if (sortId === "most_popular") {
    return copy.sort((left, right) => {
      const leftSeconds = Math.max(0, playtimeData[left.id]?.totalSeconds ?? 0);
      const rightSeconds = Math.max(0, playtimeData[right.id]?.totalSeconds ?? 0);
      if (leftSeconds !== rightSeconds) return rightSeconds - leftSeconds;
      const leftSessions = Math.max(0, playtimeData[left.id]?.sessionCount ?? 0);
      const rightSessions = Math.max(0, playtimeData[right.id]?.sessionCount ?? 0);
      if (leftSessions !== rightSessions) return rightSessions - leftSessions;
      return compareTitle(left, right);
    });
  }
  return copy.sort(compareTitle);
}

export function mergeVariantSelections(
  current: Record<string, string>,
  catalog: GameInfo[],
): Record<string, string> {
  if (catalog.length === 0) {
    return current;
  }

  const next = { ...current };
  for (const game of catalog) {
    const selectedVariantId = next[game.id];
    const hasSelectedVariant = !!selectedVariantId && game.variants.some((variant) => variant.id === selectedVariantId);
    if (!hasSelectedVariant) {
      next[game.id] = defaultVariantId(game);
    }
  }
  return next;
}
