import { Clock3, History, Trash2 } from "lucide-react";
import { memo, type JSX, type ReactNode } from "react";
import type { GameInfo } from "@shared/gfn";
import { normalizeGameStore } from "@shared/gfn";
import { useTranslation } from "../i18n";
import type { RecentGame } from "../lib/recentGames";

export interface SearchSuggestionsProps {
  /** Raw search box value. */
  query: string;
  /** Already-ranked local candidates for the current query. */
  games: GameInfo[];
  onSelect: (game: GameInfo) => void;
  isLoading?: boolean;
  maxResults?: number;
  selectedIndex?: number;
  recentGames?: RecentGame[];
  onSelectRecent?: (game: GameInfo) => void;
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

function formatRecentAccess(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return "Vừa truy cập";
  if (elapsed < 3_600_000) return `Truy cập ${Math.max(1, Math.round(elapsed / 60_000))} phút trước`;
  if (elapsed < 86_400_000) return `Truy cập ${Math.max(1, Math.round(elapsed / 3_600_000))} giờ trước`;
  if (elapsed < 7 * 86_400_000) return `Truy cập ${Math.max(1, Math.round(elapsed / 86_400_000))} ngày trước`;
  return `Truy cập lúc ${new Date(timestamp).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function GameStores({ game }: { game: GameInfo }): JSX.Element | null {
  const stores = gameStores(game);
  if (stores.length === 0) return null;
  return (
    <span className="search-suggestion-stores">
      {stores.map((store) => <span className="search-suggestion-store" key={store}>{store}</span>)}
    </span>
  );
}

export const SearchSuggestions = memo(function SearchSuggestions({
  query,
  games,
  onSelect,
  isLoading = false,
  maxResults = 30,
  selectedIndex = -1,
  recentGames = [],
  onSelectRecent,
  onClearRecent,
}: SearchSuggestionsProps): JSX.Element | null {
  const { t } = useTranslation();
  const trimmed = query.trim();
  const results = games.slice(0, maxResults);
  const showHistory = !trimmed && recentGames.length > 0 && !!onSelectRecent;

  if (!trimmed && !showHistory) return null;

  return (
    <div className="search-suggestions" role="listbox">
      {showHistory ? (
        <>
          <div className="search-suggestions-heading">
            <span><History size={13} /> Game truy cập gần đây</span>
            {onClearRecent && (
              <button type="button" className="search-suggestions-clear" onMouseDown={(event) => event.preventDefault()} onClick={onClearRecent}>
                <Trash2 size={12} /> Xóa
              </button>
            )}
          </div>
          {recentGames.map((item) => (
            <button
              type="button"
              key={item.game.id}
              className="search-history-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectRecent?.(item.game)}
            >
              <History className="search-history-icon" size={14} aria-hidden="true" />
              <span className="search-suggestion-thumb search-history-thumb" aria-hidden="true">
                {item.game.imageUrl ? <img src={item.game.imageUrl} alt="" loading="lazy" /> : <History size={15} />}
              </span>
              <span className="search-history-main">
                <span className="search-history-query">{item.game.title}</span>
                <span className="search-history-meta"><Clock3 size={11} /> {formatRecentAccess(item.lastAccessedAt)}</span>
              </span>
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
              <GameStores game={game} />
            </span>
          </button>
        ))
      )}
    </div>
  );
});

export default SearchSuggestions;
