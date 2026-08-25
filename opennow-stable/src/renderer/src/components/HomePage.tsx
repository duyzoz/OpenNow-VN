import { Search, LayoutGrid, ArrowUpDown, Filter, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { memo, useMemo, useState, useEffect, useRef, useCallback, startTransition } from "react";
import type { JSX } from "react";
import { AnimatePresence } from "motion/react";

import type { CatalogFilterGroup, CatalogSortOption, GameInfo, GamePanelResult } from "@shared/gfn";

import { GameCardListItem, useCatalogCardActionsRef } from "./GameCardListItem";

import { useTranslation } from "../i18n";
import { GameInfoPanel } from "./GameInfoPanel";
import { SearchSuggestions } from "./SearchSuggestions";
import { getGameSearchSuggestions } from "../lib/gameCatalog";
import { clearRecentGames, loadRecentGames, rememberRecentGame, type RecentGame } from "../lib/recentGames";
import { SelectDropdown } from "./ui/SelectDropdown";
import { MotionSpinner } from "./MotionSpinner";
import { formatSortLabel } from "../utils/sortLabelFormat";

export interface HomePageProps {
  games: GameInfo[];
  allGames?: GameInfo[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /**
   * Independent catalog search for the autocomplete dropdown. Does not
   * touch the main grid - only committing the search (Enter key) calls
   * onSearchChange, which is the one thing that actually re-fetches and
   * re-renders `games`.
   */
  fetchSearchSuggestions: (query: string) => Promise<GameInfo[]>;
  onPlayGame: (game: GameInfo) => void;
  isLoading: boolean;
  selectedGameId: string;
  onSelectGame: (id: string) => void;
  selectedVariantByGameId: Record<string, string>;
  onSelectGameVariant: (gameId: string, variantId: string) => void;
  filterGroups: CatalogFilterGroup[];
  selectedFilterIds: string[];
  onToggleFilter: (filterId: string) => void;
  sortOptions: CatalogSortOption[];
  selectedSortId: string;
  onSortChange: (sortId: string) => void;
  totalCount: number;
  supportedCount: number;
  controllerMode?: boolean;
  surfaceActive?: boolean;
  storePanels?: GamePanelResult[];
  storeHeroGames?: GameInfo[];
  activeSessionAppIds?: number[];
  onBuyGame?: (game: GameInfo, selectedVariantId?: string) => void;
  onMarkGameOwned?: (game: GameInfo, selectedVariantId?: string) => void;
  markOwnedInFlightByVariantId?: Record<string, boolean>;
  onPreviousControllerPage?: () => void;
  onNextControllerPage?: () => void;
  onResumeGame?: () => void;
  onTerminateGame?: () => void;
}

export const HomePage = memo(function HomePage({
  games,
  allGames = games,
  searchQuery,
  onSearchChange,
  onPlayGame,
  isLoading,
  selectedGameId,
  onSelectGame,
  selectedVariantByGameId,
  onSelectGameVariant,
  filterGroups,
  selectedFilterIds,
  onToggleFilter,
  sortOptions,
  selectedSortId,
  onSortChange,
  totalCount,
  supportedCount,
  controllerMode = false,
  surfaceActive = true,
  storePanels = [],
  storeHeroGames = [],
  activeSessionAppIds: _activeSessionAppIds = [],
  onBuyGame,
  onMarkGameOwned,
  markOwnedInFlightByVariantId = {},
  onPreviousControllerPage,
  onNextControllerPage,
  onResumeGame,
  onTerminateGame,
}: HomePageProps): JSX.Element {
  const { t } = useTranslation();
  const [gameInfoGame, setGameInfoGame] = useState<import("@shared/gfn").GameInfo | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // PERF: the search box used to write straight into the searchQuery state
  // that drives `games` (a live GFN catalog fetch). Every keystroke was
  // re-fetching and re-rendering the *entire* grid ("reflect" lag). Typing
  // now only updates this local draft, which feeds the lightweight
  // suggestions dropdown; the grid is only touched when the search is
  // actually committed (Enter).
  const [draftQuery, setDraftQuery] = useState(searchQuery);
  const [suggestions, setSuggestions] = useState<GameInfo[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [recentGames, setRecentGames] = useState<RecentGame[]>(loadRecentGames);

  useEffect(() => {
    setDraftQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const trimmed = draftQuery.trim();
    setSelectedSuggestionIndex(-1);
    if (!trimmed) {
      setSuggestions([]);
      setIsSuggesting(false);
      return undefined;
    }
    setIsSuggesting(true);
    const handle = window.setTimeout(() => {
      setSuggestions(getGameSearchSuggestions(allGames, trimmed, 30));
      setIsSuggesting(false);
    }, 40);
    return () => window.clearTimeout(handle);
  }, [allGames, draftQuery]);

  const rememberGame = useCallback((game: GameInfo) => {
    setRecentGames((current) => rememberRecentGame(current, game));
  }, []);

  const clearRecentGamesHistory = useCallback(() => {
    setRecentGames([]);
    clearRecentGames();
  }, []);

  const commitSearch = useCallback((value: string) => {
    const normalized = value.trim();
    onSearchChange(normalized);
    setIsSearchFocused(false);
    setSelectedSuggestionIndex(-1);
  }, [onSearchChange]);
  const catalogActionsRef = useCatalogCardActionsRef({
    onPlayGame,
    onSelectGame,
    onSelectGameVariant,
    onOpenStore: onBuyGame ? (game, variantId) => onBuyGame(game, variantId) : undefined,
    onResumeGame,
    onTerminateGame,
    onShowGameInfo: setGameInfoGame,
    activeSessionAppIds: _activeSessionAppIds,
  });

  const PAGE_SIZE = 64;
  const [currentPage, setCurrentPage] = useState(1);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const isPageLoadingRef = useRef(false);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(games.length / PAGE_SIZE)),
    [games.length]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [games]);

  // Page transition helper with EXACT 3.0s progress counter (270ms * 10 = 2.7s + 300ms hold = 3.0s Total)
  const goToPage = useCallback((targetPage: number) => {
    if (isPageLoadingRef.current || targetPage === currentPage || targetPage < 1 || targetPage > totalPages) return;
    isPageLoadingRef.current = true;
    setIsPageLoading(true);
    setLoadProgress(0);

    // Pre-decode 64 game poster images in GPU background thread during the 3s timer
    const upcomingGames = games.slice((targetPage - 1) * PAGE_SIZE, targetPage * PAGE_SIZE);
    upcomingGames.forEach((g) => {
      if (g.imageUrl) {
        const img = new Image();
        img.src = g.imageUrl;
      }
    });

    let progress = 0;
    // Step +10% every 270ms = 2.7s count + 300ms hold at 100% = EXACTLY 3.0s Total
    const interval = setInterval(() => {
      progress += 10;
      setLoadProgress(Math.min(progress, 100));
      if (progress >= 100) {
        clearInterval(interval);

        // INSTANTLY update page synchronously (no lingering on old page)
        setCurrentPage(targetPage);

        // Scroll to top of grid area instantly
        const gridArea = document.querySelector(".home-grid-area");
        if (gridArea) {
          gridArea.scrollTop = 0;
        }

        // Hide loading badge AFTER DOM has updated with new page items
        setTimeout(() => {
          setIsPageLoading(false);
          isPageLoadingRef.current = false;
        }, 150);
      }
    }, 270);
  }, [currentPage, games, totalPages]);

  // EXACTLY 64 CARDS PER PAGE IN DOM
  const current64Games = useMemo(
    () => games.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [games, currentPage]
  );

  // Keep the scroll reveal lightweight: update one state attribute per threshold,
  // never blur or write transform/opacity inline during scrolling.
  useEffect(() => {
    const cards = document.querySelectorAll(".home-page .scroll-anim-wrapper");
    if (cards.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const ratio = entry.intersectionRatio;
          const el = entry.target as HTMLElement;
          const state = ratio >= 0.65 ? "full" : ratio >= 0.35 ? "near" : "far";
          if (el.dataset.scrollState !== state) el.dataset.scrollState = state;
        });
      },
      { threshold: [0, 0.35, 0.65, 1.0] }
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [current64Games]);

  const gameGridItems = useMemo(
    () => current64Games.map((game, index) => (
      <div
        key={`${game.id}-p${currentPage}`}
        className="scroll-anim-wrapper card-batch-anim"
        style={{ "--card-i": index } as React.CSSProperties}
      >
        <GameCardListItem
          game={game}
          isSelected={game.id === selectedGameId}
          selectedVariantId={selectedVariantByGameId[game.id]}
          surface="home"
          actionsRef={catalogActionsRef}
        />
      </div>
    )),
    [catalogActionsRef, current64Games, selectedGameId, selectedVariantByGameId, currentPage],
  );


  const hasGames = games.length > 0;
  const showInitialLoading = isLoading && !hasGames;
  const visibleFilterGroups = filterGroups.filter((group) => ["digital_store", "genre", "subscriptions"].includes(group.id));
  const activeFilterCount = selectedFilterIds.length;
  const countLabel =
    totalCount > 0 && supportedCount > 0
      ? t("home.count.shownTotalSupported", { shown: games.length, total: totalCount, supported: supportedCount })
      : totalCount > games.length
        ? t("home.count.shownTotal", { shown: games.length, total: totalCount })
        : supportedCount > 0
          ? t("home.count.shownSupported", { shown: games.length, supported: supportedCount })
          : t("home.count.shown", { shown: games.length });

  return (
    <>
      <div className="home-page">
        {isPageLoading && (
          <div className="batch-load-floating-pill">
            <MotionSpinner size={18} />
            <span>{t("common.loading")} {loadProgress}%</span>
          </div>
        )}

        <header className="home-toolbar">
          <div className="home-search">
            <Search className="home-search-icon" size={16} />
            <input
              type="text"
              className="home-search-input"
              placeholder={t("home.searchPlaceholder")}
              value={draftQuery}
              onChange={(e) => {
                const value = e.target.value;
                setDraftQuery(value);
                if (value.trim() === "" && searchQuery !== "") {
                  // Clearing is an explicit action, not "typing" - reflect it
                  // in the grid immediately instead of waiting for Enter.
                  onSearchChange("");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && draftQuery.trim() && suggestions.length > 0) {
                  e.preventDefault();
                  setSelectedSuggestionIndex((current) => Math.min(current + 1, Math.min(suggestions.length, 30) - 1));
                } else if (e.key === "ArrowUp" && draftQuery.trim() && suggestions.length > 0) {
                  e.preventDefault();
                  setSelectedSuggestionIndex((current) => Math.max(current - 1, -1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const selected = selectedSuggestionIndex >= 0 ? suggestions[selectedSuggestionIndex] : undefined;
                  if (selected) {
                    rememberGame(selected);
                    setGameInfoGame(selected);
                    setIsSearchFocused(false);
                  } else {
                    commitSearch(draftQuery);
                  }
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setIsSearchFocused(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
            {isSearchFocused && (
              <SearchSuggestions
                query={draftQuery}
                games={suggestions}
                isLoading={isSuggesting}
                maxResults={30}
                selectedIndex={selectedSuggestionIndex}
                recentGames={recentGames}
                onSelectRecent={(game) => {
                  setDraftQuery(game.title);
                  rememberGame(game);
                  setGameInfoGame(game);
                  setIsSearchFocused(false);
                }}
                onClearRecent={clearRecentGamesHistory}
                onSelect={(game) => {
                  rememberGame(game);
                  setGameInfoGame(game);
                  setIsSearchFocused(false);
                  setSelectedSuggestionIndex(-1);
                }}
              />
            )}
          </div>

          {visibleFilterGroups.length > 0 && (
            <details className="home-filter-dropdown">
              <summary className="home-filter-dropdown-trigger">
                <span className="home-filter-dropdown-label">
                  <Filter size={14} />
                  {t("home.filters")}
                </span>
                {activeFilterCount > 0 && <span className="home-filter-dropdown-count">{activeFilterCount}</span>}
                <ChevronDown size={14} className="home-filter-dropdown-chevron" />
              </summary>
              <div className="home-filter-dropdown-menu">
                {visibleFilterGroups.map((group) => (
                  <div key={group.id} className="home-filter-dropdown-group">
                    <div className="home-filter-group-label">{group.label}</div>
                    <div className="home-filter-chips">
                      {group.options.slice(0, group.id === "genre" ? 8 : group.options.length).map((option) => {
                        const active = selectedFilterIds.includes(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={`home-filter-chip ${active ? "active" : ""}`}
                            onClick={() => onToggleFilter(option.id)}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {sortOptions.length > 0 && (
            <div className="home-sort">
              <ArrowUpDown size={14} />
              <SelectDropdown
                value={selectedSortId}
                options={sortOptions.map((option) => ({ value: option.id, label: formatSortLabel(t, option.id, option.label) }))}
                onChange={onSortChange}
                disabled={showInitialLoading}
                ariaLabel={t("home.sortAriaLabel")}
              />
            </div>
          )}

          <span className="home-count">
            {countLabel}
          </span>
        </header>

        <div className="home-grid-area">
          {showInitialLoading ? (
            <div className="home-empty-state">
              <MotionSpinner className="home-spinner" size={36} label={t("common.loading")} />
              <p>{t("home.empty.loadingGames")}</p>
            </div>
          ) : !hasGames ? (
            <div className="home-empty-state">
              <LayoutGrid size={44} className="home-empty-icon" />
              <h3>{t("home.empty.noGamesFound")}</h3>
              <p>
                {searchQuery || selectedFilterIds.length > 0
                  ? t("home.empty.tryAdjustingSearch")
                  : t("home.empty.checkBackLater")}
              </p>
            </div>
          ) : (
            <div style={{ position: "relative", width: "100%" }}>
              <div className="game-grid">
                {gameGridItems}
              </div>

              {hasGames && totalPages > 1 && (
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
          )}
        </div>
      </div>
      {gameInfoGame && (
        <AnimatePresence>
          <GameInfoPanel
            game={gameInfoGame}
            isActiveGame={_activeSessionAppIds.some(
              (id) => gameInfoGame.variants.some((v) => String(v.id) === String(id)) || String(gameInfoGame.launchAppId) === String(id),
            )}
            onResume={onResumeGame}
            onTerminate={onTerminateGame}
            onPlay={() => { onPlayGame(gameInfoGame); setGameInfoGame(null); }}
            onClose={() => setGameInfoGame(null)}
          />
        </AnimatePresence>
      )}
    </>
  );
});
