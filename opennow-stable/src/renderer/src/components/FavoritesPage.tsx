import { Heart, Search, X, Gamepad2 } from "lucide-react";
import { memo, useMemo, useState, useSyncExternalStore, type JSX } from "react";
import type { GameInfo } from "@shared/gfn";
import { useTranslation } from "../i18n";
import { GameCardListItem, useCatalogCardActionsRef } from "./GameCardListItem";
import { GameInfoPanel } from "./GameInfoPanel";
import { AnimatePresence } from "motion/react";
import {
  getFavoritesSnapshot,
  subscribeToFavorites,
  clearFavorites,
} from "../lib/gamePreferences";

export interface FavoritesPageProps {
  games: GameInfo[];
  /** True while the catalog is still being fetched. */
  isCatalogLoading?: boolean;
  onPlayGame: (game: GameInfo) => void;
  selectedGameId: string;
  onSelectGame: (id: string) => void;
  selectedVariantByGameId: Record<string, string>;
  onSelectGameVariant: (gameId: string, variantId: string) => void;
  activeSessionAppIds?: number[];
  onResumeGame?: () => void;
  onTerminateGame?: () => void;
}

export const FavoritesPage = memo(function FavoritesPage({
  games,
  isCatalogLoading = false,
  onPlayGame,
  selectedGameId,
  onSelectGame,
  selectedVariantByGameId,
  onSelectGameVariant,
  activeSessionAppIds = [],
  onResumeGame,
  onTerminateGame,
}: FavoritesPageProps): JSX.Element {
  const { t } = useTranslation();
  // NOTE: state hooks are declared BEFORE any hook that consumes them,
  // otherwise we hit the same TDZ crash that took down HomePage.
  const [query, setQuery] = useState("");
  const [infoGame, setInfoGame] = useState<GameInfo | null>(null);

  const catalogActionsRef = useCatalogCardActionsRef({
    onPlayGame,
    onSelectGame,
    onSelectGameVariant,
    onResumeGame,
    onTerminateGame,
    onShowGameInfo: setInfoGame,
    activeSessionAppIds,
  });

  // Live-updating list of favorite ids.
  const favoriteIds = useSyncExternalStore(
    subscribeToFavorites,
    getFavoritesSnapshot,
    getFavoritesSnapshot,
  );

  // Index the catalog once so lookups are O(1) instead of O(n) per favorite.
  const gamesById = useMemo(() => {
    const map = new Map<string, GameInfo>();
    for (const game of games) map.set(game.id, game);
    return map;
  }, [games]);

  const favoriteGames = useMemo(() => {
    const result: GameInfo[] = [];
    for (const id of favoriteIds) {
      const game = gamesById.get(id);
      if (game) result.push(game);
    }
    return result;
  }, [favoriteIds, gamesById]);

  const visibleGames = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return favoriteGames;
    return favoriteGames.filter((game) => game.title.toLowerCase().includes(term));
  }, [favoriteGames, query]);

  // BUGFIX: the page used to say "Chưa có tựa game nào được lưu · 3 game không còn
  // trong danh mục" at the same time. That happened because it only received the
  // store catalog, so favourites hearted from the Library resolved to nothing.
  // It now receives every known game, and any still-unresolved id is treated as
  // "catalog still loading" rather than "you have no favourites".
  const unresolvedCount = Math.max(0, favoriteIds.length - favoriteGames.length);
  const hasFavorites = favoriteIds.length > 0;
  const isResolving = unresolvedCount > 0 && (isCatalogLoading || games.length === 0);
  const missingCount = isResolving ? 0 : unresolvedCount;

  const activeInfoGame = infoGame
    ? {
        game: infoGame,
        isActive: activeSessionAppIds.some(
          (id) =>
            infoGame.variants.some((variant) => String(variant.id) === String(id))
            || String(infoGame.launchAppId) === String(id),
        ),
      }
    : null;

  return (
    <div className="favorites-page">
      <div className="favorites-header">
        <div className="favorites-title-block">
          <h1 className="favorites-title">
            <Heart size={20} className="favorites-title-icon" />
            {t("favorites.title")}
          </h1>
          <p className="favorites-subtitle">
            {hasFavorites
              ? t("favorites.savedCount", { count: favoriteIds.length })
              : t("favorites.noGames")}
            {isResolving ? ` · ${t("favorites.resolving", { count: unresolvedCount })}` : ""}
            {missingCount > 0 ? ` · ${t("favorites.missing", { count: missingCount })}` : ""}
          </p>
        </div>

        <div className="favorites-toolbar">
          <div className="favorites-search">
            <Search size={15} className="favorites-search-icon" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("favorites.searchPlaceholder")}
              className="favorites-search-input"
              aria-label={t("favorites.searchPlaceholder")}
            />
            {query && (
              <button
                type="button"
                className="favorites-search-clear"
                onClick={() => setQuery("")}
                aria-label={t("favorites.clearSearch")}
              >
                <X size={13} />
              </button>
            )}
          </div>
          {hasFavorites && (
            <button
              type="button"
              className="favorites-clear-btn"
              onClick={() => {
                if (window.confirm(t("favorites.clearAllConfirm"))) clearFavorites();
              }}
            >
              {t("favorites.clearAll")}
            </button>
          )}
        </div>
      </div>

      {visibleGames.length === 0 ? (
        <div className="favorites-empty">
          <div className="favorites-empty-icon">
            {hasFavorites ? <Gamepad2 size={40} /> : <Heart size={40} />}
          </div>
          <h2 className="favorites-empty-title">
            {!hasFavorites
              ? t("favorites.emptyTitle")
              : isResolving
                ? t("favorites.loadingTitle")
                : query.trim()
                  ? t("favorites.noResultsTitle")
                  : t("favorites.hiddenTitle")}
          </h2>
          <p className="favorites-empty-text">
            {!hasFavorites
              ? t("favorites.emptyHint")
              : isResolving
                ? t("favorites.loadingHint", { unresolved: unresolvedCount, total: favoriteIds.length })
                : query.trim()
                  ? t("favorites.noResultsHint", { query })
                  : t("favorites.hiddenHint", { count: favoriteIds.length })}
          </p>
        </div>
      ) : (
        <div className="favorites-grid">
          {visibleGames.map((game) => (
            <GameCardListItem
              key={game.id}
              game={game}
              selectedVariantId={selectedVariantByGameId[game.id]}
              isSelected={selectedGameId === game.id}
              surface="library"
              actionsRef={catalogActionsRef}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {activeInfoGame && (
          <GameInfoPanel
            key={activeInfoGame.game.id}
            game={activeInfoGame.game}
            isActiveGame={activeInfoGame.isActive}
            onResume={onResumeGame}
            onTerminate={onTerminateGame}
            onPlay={() => {
              onPlayGame(activeInfoGame.game);
              setInfoGame(null);
            }}
            onClose={() => setInfoGame(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
});
