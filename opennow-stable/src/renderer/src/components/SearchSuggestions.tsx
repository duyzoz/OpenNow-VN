import { memo, type JSX, type ReactNode } from "react";
import type { GameInfo } from "@shared/gfn";
import { useTranslation } from "../i18n";

export interface SearchSuggestionsProps {
  /** Raw search box value. The dropdown renders nothing while this is empty. */
  query: string;
  /**
   * Already-filtered candidate games for the current page (Home/Library/
   * Favorites each pass their own already-computed search results here, so
   * this component never re-implements matching - it only presents it).
   */
  games: GameInfo[];
  onSelect: (game: GameInfo) => void;
  /**
   * True while the caller is still computing/fetching `games` for the
   * current query (e.g. Home's server-backed catalog search). There is no
   * fixed delay here on purpose - the panel just waits for this to flip to
   * false, however long that actually takes on the user's machine/network.
   */
  isLoading?: boolean;
  maxResults?: number;
}

/** Wraps the substring of `title` that matches `query` in a <mark>-like span. */
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

/**
 * Floating autocomplete panel shown under a search input while it's focused
 * and has text in it. Home/Library/Favorites already compute their own
 * search-filtered game list for the main grid - this just shows the top few
 * of that same list, so results are always consistent with what the grid
 * shows once you hit Enter or stop typing.
 *
 * PERF: this only ever renders up to `maxResults` rows (default 4), so the
 * one-shot entrance animation (see .search-suggestions in styles.css) never
 * touches more than a handful of DOM nodes - nothing like the cost profile
 * of animating the full game grid.
 */
export const SearchSuggestions = memo(function SearchSuggestions({
  query,
  games,
  onSelect,
  isLoading = false,
  maxResults = 30,
}: SearchSuggestionsProps): JSX.Element | null {
  const { t } = useTranslation();
  const trimmed = query.trim();
  if (!trimmed) return null;

  const results = games.slice(0, maxResults);

  return (
    <div className="search-suggestions" role="listbox">
      {isLoading ? (
        <div className="search-suggestions-loading">
          <span className="search-suggestions-spinner" aria-hidden="true" />
          <span>{t("common.loading")}</span>
        </div>
      ) : results.length === 0 ? (
        <div className="search-suggestions-empty">
          {t("search.suggestions.notFound", { query: trimmed })}
        </div>
      ) : (
        results.map((game) => (
          <button
            type="button"
            key={game.id}
            className="search-suggestion-item"
            role="option"
            aria-selected={false}
            // Selecting via mousedown (not click) so the input's blur handler
            // never gets a chance to close the dropdown before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(game)}
          >
            <span className="search-suggestion-thumb" aria-hidden="true">
              {game.imageUrl ? <img src={game.imageUrl} alt="" loading="lazy" /> : null}
            </span>
            <span className="search-suggestion-title">{highlightMatch(game.title, trimmed)}</span>
          </button>
        ))
      )}
    </div>
  );
});

export default SearchSuggestions;
