import { History, Trash2 } from "lucide-react";
import { memo, type JSX, type ReactNode } from "react";
import type { GameInfo } from "@shared/gfn";
import { normalizeGameStore } from "@shared/gfn";
import { useTranslation } from "../i18n";

export interface RecentSearch {
  query: string;
  count: number;
}

export interface SearchSuggestionsProps {
  /** Raw search box value. */
  query: string;
  /** Already-filtered candidate games for the current query. */
  games: GameInfo[];
  onSelect: (game: GameInfo) => void;
  isLoading?: boolean;
  maxResults?: number;
  selectedIndex?: number;
  recentSearches?: RecentSearch[];
  onSelectRecent?: (query: string) => void;
  onClearRecent?: () => void;
}

function highlightMatch(title: string, query: string): ReactNode {
  const index = title.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return title;
  return (
    <>
      {title.slice(0, index)}
      <span className="search-suggestion-match">{title.slice(index, index + query.length)}</span>
      {title.slice(index + query.length)}
    </>
  );
}

function storeLabel(store: string): string {
  const normalized = normalizeGameStore(store);
  const labels: Record<string, string> = {
    STEAM: "Steam",
    EPIC_GAMES_STORE: "Epic",
    EPIC: "Epic",
    EA_APP: "EA",
    UPLAY: "Ubisoft",
    BATTLE_NET: "Battle.net",
    GOG: "GOG",
    XBOX: "Xbox",
    PLAYSTATION: "PlayStation",
  };
  return labels[normalized] ?? normalized.replace(/_/g, " ");
}

function gameStores(game: GameInfo): string[] {
  const stores = game.variants.map((variant) => variant.store).concat(game.availableStores ?? []);
  return Array.from(new Set(stores.filter(Boolean).map(storeLabel))).slice(0, 3);
}

export const SearchSuggestions = memo(function SearchSuggestions({
  query,
  games,
  onSelect,
  isLoading = false,
  maxResults = 30,
  selectedIndex = -1,
  recentSearches = [],
  onSelectRecent,
  onClearRecent,
}: SearchSuggestionsProps): JSX.Element | null {
  const { t } = useTranslation();
  const trimmed = query.trim();
  const results = games.slice(0, maxResults);
  const showHistory = !trimmed && recentSearches.length > 0 && !!onSelectRecent;

  if (!trimmed && !showHistory) return null;

  return (
    <div className="search-suggestions" role="listbox">
      {showHistory ? (
        <>
          <div className="search-suggestions-heading">
            <span><History size={13} /> Tìm kiếm gần đây</span>
            {onClearRecent && (
              <button type="button" className="search-suggestions-clear" onMouseDown={(event) => event.preventDefault()} onClick={onClearRecent}>
                <Trash2 size={12} /> Xóa
              </button>
            )}
          </div>
          {recentSearches.map((item) => (
            <button
              type="button"
              key={item.query}
              className="search-history-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectRecent(item.query)}
            >
              <History size={15} aria-hidden="true" />
              <span className="search-history-query">{item.query}</span>
              <span className="search-history-count">{item.count}</span>
            </button>
          ))}
        </>
      ) : isLoading ? (
        <div className="search-suggestions-loading">
          <span className="search-suggestions-spinner" aria-hidden="true" />
          <span>{t("common.loading")}</span>
        </div>
      ) : results.length === 0 ? (
        <div className="search-suggestions-empty">
          {t("search.suggestions.notFound", { query: trimmed })}
        </div>
      ) : (
        results.map((game, index) => (
          <button
            type="button"
            key={game.id}
            className={`search-suggestion-item ${index === selectedIndex ? "is-active" : ""}`}
            role="option"
            aria-selected={index === selectedIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(game)}
          >
            <span className="search-suggestion-thumb" aria-hidden="true">
              {game.imageUrl ? <img src={game.imageUrl} alt="" loading="lazy" /> : null}
            </span>
            <span className="search-suggestion-main">
              <span className="search-suggestion-title">{highlightMatch(game.title, trimmed)}</span>
              {gameStores(game).length > 0 && (
                <span className="search-suggestion-stores">
                  {gameStores(game).map((store) => <span className="search-suggestion-store" key={store}>{store}</span>)}
                </span>
              )}
            </span>
          </button>
        ))
      )}
    </div>
  );
});

export default SearchSuggestions;
