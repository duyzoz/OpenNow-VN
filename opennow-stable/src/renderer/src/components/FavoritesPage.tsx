import { Heart, Search, X, Gamepad2, ChevronLeft, ChevronRight } from "lucide-react";
import { memo, useEffect, useMemo, useState, useRef, useCallback, useSyncExternalStore, type JSX } from "react";
import type { GameInfo } from "@shared/gfn";
import { useTranslation } from "../i18n";
import { GameCardListItem, useCatalogCardActionsRef } from "./GameCardListItem";
import { GameInfoPanel } from "./GameInfoPanel";
import { MotionSpinner } from "./MotionSpinner";
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

  const PAGE_SIZE = 64;
  const [currentPage, setCurrentPage] = useState(1);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const isPageLoadingRef = useRef(false);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleGames.length / PAGE_SIZE)),
    [visibleGames.length]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [visibleGames]);

  const goToPage = useCallback((targetPage: number) => {
    if (isPageLoadingRef.current || targetPage === currentPage || targetPage < 1 || targetPage > totalPages) return;
    isPageLoadingRef.current = true;
    setIsPageLoading(true);
    setLoadProgress(0);

    const upcomingGames = visibleGames.slice((targetPage - 1) * PAGE_SIZE, targetPage * PAGE_SIZE);
    upcomingGames.forEach((g) => {
      if (g.imageUrl) {
        const img = new Image();
        img.src = g.imageUrl;
      }
    });

    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setLoadProgress(Math.min(progress, 100));
      if (progress >= 100) {
        clearInterval(interval);

        // INSTANTLY update page synchronously (no lingering on old page)
        setCurrentPage(targetPage);

        const gridArea = document.querySelector(".favorites-grid-area");
        if (gridArea) {
          gridArea.scrollTop = 0;
        }

        setTimeout(() => {
          setIsPageLoading(false);
          isPageLoadingRef.current = false;
        }, 150);
      }
    }, 270);
  }, [currentPage, totalPages, visibleGames]);

  const current64FavoriteGames = useMemo(
    () => visibleGames.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [visibleGames, currentPage]
  );

  useEffect(() => {
    const cards = document.querySelectorAll(".favorites-page .scroll-anim-wrapper");
    if (cards.length === 0) return undefined;

    let rafId: number | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          entries.forEach((entry) => {
            const ratio = entry.intersectionRatio;
            const el = entry.target as HTMLElement;
            if (ratio >= 0.65) {
              el.style.filter = "blur(0px)";
              el.style.opacity = "1";
              el.style.transform = "perspective(1000px) rotateX(0deg) scale(1) translateY(0)";
            } else if (ratio >= 0.35) {
              el.style.filter = "blur(5px)";
              el.style.opacity = "0.78";
              el.style.transform = "perspective(1000px) rotateX(10deg) scale(0.96) translateY(4px)";
            } else {
              el.style.filter = "blur(14px)";
              el.style.opacity = "0.32";
              el.style.transform = "perspective(1000px) rotateX(22deg) scale(0.88) translateY(14px)";
            }
          });
        });
      },
      { threshold: [0, 0.2, 0.4, 0.65, 0.85, 1.0] }
    );

    cards.forEach((c) => observer.observe(c));
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [current64FavoriteGames]);

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
      {isPageLoading && (
        <div className="batch-load-floating-pill">
          <MotionSpinner size={18} />
          <span>{t("common.loading")} {loadProgress}%</span>
        </div>
      )}
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
        <div className="favorites-grid-area">
          <div style={{ position: "relative", width: "100%" }}>
            <div className="game-grid">
              {current64FavoriteGames.map((game, index) => (
                <div
                  key={`${game.id}-p${currentPage}`}
                  className="scroll-anim-wrapper card-batch-anim"
                  style={{ "--card-i": index } as React.CSSProperties}
                >
                  <GameCardListItem
                    game={game}
                    selectedVariantId={selectedVariantByGameId[game.id]}
                    isSelected={selectedGameId === game.id}
                    surface="home"
                    actionsRef={catalogActionsRef}
                  />
                </div>
              ))}
            </div>

            {visibleGames.length > 0 && totalPages > 1 && (
              <div className="catalog-pagination">
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1 || isPageLoading}
                  aria-label={t("app.actions.back")}
                >
                  <ChevronLeft size={16} />
                  <span>{t("app.actions.back")}</span>
                </button>

                <div className="pagination-numbers" style={{ display: "flex", gap: "4px" }}>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                    if (
                      p === 1 ||
                      p === totalPages ||
                      (p >= currentPage - 2 && p <= currentPage + 2)
                    ) {
                      return (
                        <button
                          key={p}
                          type="button"
                          className={`pagination-btn pagination-num ${p === currentPage ? "active" : ""}`}
                          onClick={() => goToPage(p)}
                          disabled={isPageLoading}
                        >
                          {p}
                        </button>
                      );
                    }
                    if (p === currentPage - 3 || p === currentPage + 3) {
                      return <span key={p} className="pagination-summary">...</span>;
                    }
                    return null;
                  })}
                </div>

                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages || isPageLoading}
                  aria-label={t("app.actions.continue")}
                >
                  <span>{t("app.actions.continue")}</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
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
