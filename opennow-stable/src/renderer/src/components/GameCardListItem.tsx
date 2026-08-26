import { memo, useCallback, useRef, useSyncExternalStore, type RefObject } from "react";
import {
  isFavorite as checkFavorite,
  toggleFavorite,
  subscribeToFavorites,
} from "../lib/gamePreferences";
import type { GameInfo } from "@shared/gfn";
import { GameCard } from "./GameCard";

export interface CatalogCardActions {
  onPlayGame: (game: GameInfo) => void;
  onSelectGame: (gameId: string) => void;
  onSelectGameVariant: (gameId: string, variantId: string) => void;
  onOpenStore?: (game: GameInfo, variantId?: string) => void;
  onResumeGame?: () => void;
  onTerminateGame?: () => void;
  onShowGameInfo?: (game: GameInfo) => void;
  onToggleFavorite?: (gameId: string) => void;
  activeSessionAppIds?: number[];
  favoriteIds?: string[];
}

export interface GameCardListItemProps {
  game: GameInfo;
  selectedVariantId?: string;
  isSelected?: boolean;
  surface?: "home" | "library";
  actionsRef: RefObject<CatalogCardActions>;
}

function gameCardListItemPropsAreEqual(
  prev: GameCardListItemProps,
  next: GameCardListItemProps,
): boolean {
  return (
    prev.game === next.game
    && prev.selectedVariantId === next.selectedVariantId
    && prev.isSelected === next.isSelected
    && prev.surface === next.surface
    && prev.actionsRef === next.actionsRef
  );
}

export const GameCardListItem = memo(function GameCardListItem({
  game,
  selectedVariantId,
  isSelected = false,
  surface = "home",
  actionsRef,
}: GameCardListItemProps) {
  const handleSelect = useCallback(() => {
    actionsRef.current?.onSelectGame(game.id);
  }, [actionsRef, game.id]);

  const handlePlay = useCallback(() => {
    actionsRef.current?.onPlayGame(game);
  }, [actionsRef, game]);

  // PERF: O(1) in-memory lookup, and the card only re-renders when *its own*
  // favorite flag actually flips (getSnapshot returns a boolean primitive).
  const favState = useSyncExternalStore(
    subscribeToFavorites,
    () => checkFavorite(game.id),
    () => false,
  );

  const handleResume = useCallback(() => {
    actionsRef.current?.onResumeGame?.();
  }, [actionsRef]);

  const handleTerminate = useCallback(() => {
    actionsRef.current?.onTerminateGame?.();
  }, [actionsRef]);

  const handleShowInfo = useCallback(() => {
    actionsRef.current?.onShowGameInfo?.(game);
  }, [actionsRef, game]);

  const handleToggleFavorite = useCallback(() => {
    toggleFavorite(game.id);
    actionsRef.current?.onToggleFavorite?.(game.id);
  }, [actionsRef, game.id]);

  const handleSelectStore = useCallback((variantId: string) => {
    actionsRef.current?.onSelectGameVariant(game.id, variantId);
  }, [actionsRef, game.id]);

  const handleOpenStore = useCallback((variantId: string) => {
    actionsRef.current?.onOpenStore?.(game, variantId);
  }, [actionsRef, game, game.id]);

  const isActiveGame = (actionsRef.current?.activeSessionAppIds ?? []).some(
    (id) => game.variants.some((v) => String(v.id) === String(id)) || String(game.launchAppId) === String(id),
  );
  return (
    <div className="game-card-scroll-shell">
      <GameCard
        game={game}
        isSelected={isSelected}
        selectedVariantId={selectedVariantId}
        surface={surface}
        onSelect={handleSelect}
        onPlay={handlePlay}
        onSelectStore={handleSelectStore}
        onOpenStore={handleOpenStore}
        isActiveGame={isActiveGame}
        isFavorite={favState}
        onResume={handleResume}
        onTerminate={handleTerminate}
        onShowInfo={handleShowInfo}
        onToggleFavorite={handleToggleFavorite}
      />
    </div>
  );
}, gameCardListItemPropsAreEqual);

export function useCatalogCardActionsRef(actions: CatalogCardActions): RefObject<CatalogCardActions> {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  return actionsRef;
}
