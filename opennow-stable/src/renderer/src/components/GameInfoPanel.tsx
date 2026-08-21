import {
  BarChart2,
  CalendarClock,
  Check,
  Clock,
  Crown,
  ExternalLink,
  Gamepad2,
  Heart,
  LockKeyhole,
  PlayCircle,
  Square,
  X,
} from "lucide-react";
import { useTranslation } from "../i18n";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { GameInfo } from "@shared/gfn/catalog";
import { m } from "motion/react";
import { isFavorite, toggleFavorite } from "../lib/gamePreferences";
import {
  formatDuration,
  getPlaytimeStat,
  invalidatePlaytimeCache,
} from "../lib/playtimeStats";
import { formatCatalogAccessTime } from "../utils/lastPlayedFormat";
import { getControllerHeroBackgroundCandidates, getPlayerSummary } from "../lib/controllerCatalogUi";
import { getStoreOptions } from "../lib/gameCardStores";
import { getRequiredPaidMembershipTier } from "../lib/premiumMembership";
import { getStoreDisplayName, getStoreIconComponent } from "./GameCard";

interface GameInfoPanelProps {
  game: GameInfo | null;
  isActiveGame?: boolean;
  onResume?: () => void;
  onTerminate?: () => void;
  onPlay?: () => void;
  onSelectVariant?: (variantId: string) => void;
  onClose: () => void;
}

const descCache = new Map<string, string>();
const FALLBACK_DESCRIPTION = "__GAMEINFO_FALLBACK__";

async function fetchDescription(game: GameInfo): Promise<string> {
  if (descCache.has(game.id)) return descCache.get(game.id)!;
  const steamVariant = (game.variants ?? []).find(
    (variant) => /^\d+$/.test(variant.id ?? "") && (variant.store ?? "").toUpperCase().includes("STEAM"),
  );
  const steamId = steamVariant?.id ?? (/^\d+$/.test(game.id) ? game.id : null);
  if (steamId) {
    try {
      const response = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${steamId}&l=vietnamese`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (response.ok) {
        const data = await response.json();
        const description = data[steamId]?.data?.short_description as string | undefined;
        if (description) {
          descCache.set(game.id, description);
          return description;
        }
      }
    } catch {
      // The catalog description remains the fallback when Steam is unreachable.
    }
  }
  const catalogDescription = game.description
    || game.longDescription
    || game.featureLabels?.join(" / ");
  const fallback = catalogDescription || FALLBACK_DESCRIPTION;
  descCache.set(game.id, fallback);
  return fallback;
}

export function GameInfoPanel({
  game,
  isActiveGame = false,
  onResume,
  onTerminate,
  onPlay,
  onSelectVariant,
  onClose,
}: GameInfoPanelProps): JSX.Element {
  const { t } = useTranslation();
  const [desc, setDesc] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [imgErr, setImgErr] = useState(false);
  const [fav, setFav] = useState(false);
  const [favToast, setFavToast] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const heroCandidates = useMemo(
    () => (game ? getControllerHeroBackgroundCandidates(game) : []),
    [game],
  );
  const storeOptions = useMemo(
    () => (game ? getStoreOptions(game, selectedVariantId) : []),
    [game, selectedVariantId],
  );
  const activeStoreOption = storeOptions.find((option) => option.isActive) ?? storeOptions[0];
  const requiredPaidMembershipTier = game ? getRequiredPaidMembershipTier(game) : null;

  useEffect(() => {
    if (!game) return;
    setDesc(null);
    setHeroIndex(0);
    setImgErr(false);
    setFav(isFavorite(game.id));
    setSelectedVariantId(undefined);
    setDescriptionExpanded(false);
    invalidatePlaytimeCache();
    let cancelled = false;
    fetchDescription(game).then((value) => {
      if (!cancelled) setDesc(value);
    });
    return () => {
      cancelled = true;
    };
  }, [game?.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleBackdrop = useCallback((event: React.MouseEvent): void => {
    if (event.target === event.currentTarget) onClose();
  }, [onClose]);

  const handleFavorite = useCallback((): void => {
    if (!game) return;
    const nowFavorite = toggleFavorite(game.id);
    setFav(nowFavorite);
    setFavToast(nowFavorite ? t("gameInfo.favoriteAdded") : t("gameInfo.favoriteRemoved"));
    window.setTimeout(() => setFavToast(null), 2000);
  }, [game, t]);

  const handleSelectVariant = useCallback((variantId: string): void => {
    setSelectedVariantId(variantId);
    onSelectVariant?.(variantId);
  }, [onSelectVariant]);

  if (!game) return <></>;

  const heroUrl = heroCandidates[heroIndex] ?? (!imgErr ? game.heroImageUrl ?? game.imageUrl : undefined);
  const coverUrl = game.imageUrl;
  const stats = getPlaytimeStat(game.id);
  const lastPlayedLabel = stats.lastPlayedAt ? formatCatalogAccessTime(stats.lastPlayedAt) : null;
  const hasStats = stats.sessionCount > 0 || stats.totalSeconds > 0;
  const description = desc === FALLBACK_DESCRIPTION
    ? t("gameInfo.fallbackDesc")
    : (desc ?? t("gameInfo.loadingDesc"));
  const playerSummary = getPlayerSummary(game)
    ?.replace(/\bLocal\b/g, "Cục bộ")
    .replace(/\bOnline\b/g, "Trực tuyến");
  const metadata = [
    game.developerName ? t("library.developer", { developer: game.developerName }) : null,
    game.publisherName ? t("library.publisher", { publisher: game.publisherName }) : null,
    playerSummary ? t("library.players", { players: playerSummary }) : null,
    game.genres?.length ? t("library.genres", { genres: game.genres.slice(0, 4).join(", ") }) : null,
    game.supportedControls?.length
      ? t("library.controls", { controls: game.supportedControls.slice(0, 4).join(", ") })
      : null,
    game.nvidiaTech?.length
      ? t("library.nvidiaTech", { tech: game.nvidiaTech.slice(0, 4).join(", ") })
      : null,
    game.contentRatings?.length
      ? t("library.rating", { rating: game.contentRatings.slice(0, 2).join(", ") })
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="game-info-backdrop" onClick={handleBackdrop}>
      {favToast && <div className="game-info-toast">{favToast}</div>}
      <m.div
        ref={panelRef}
        className="game-info-panel"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
        role="dialog"
        aria-modal="true"
        aria-label={t("gameDetails.viewDetailsFor", { title: game.title })}
      >
        <header className="game-info-hero">
          {heroUrl && !imgErr ? (
            <img
              src={heroUrl}
              alt={game.title}
              className="game-info-hero-img"
              onError={() => {
                if (heroIndex + 1 < heroCandidates.length) setHeroIndex((index) => index + 1);
                else setImgErr(true);
              }}
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="game-info-hero-placeholder"><Gamepad2 size={48} opacity={0.3} /></div>
          )}
          <div className="game-info-hero-overlay" />
          <button className="game-info-close" onClick={onClose} title={t("gameInfo.closeLabel")} aria-label={t("app.actions.close")}>
            <X size={17} />
          </button>
          <button
            className={`game-info-fav-btn${fav ? " active" : ""}`}
            onClick={handleFavorite}
            title={fav ? t("gameInfo.removeFromFavorites") : t("gameInfo.addToFavorites")}
            aria-label={fav ? t("gameInfo.removeFromFavorites") : t("gameInfo.addToFavorites")}
          >
            <Heart size={17} fill={fav ? "currentColor" : "none"} />
          </button>
          {isActiveGame && (
            <div className="game-info-active-badge">
              <span className="game-info-active-pulse" />
              {t("gameInfo.activeBadge")}
            </div>
          )}
        </header>

        <div className="game-info-content">
          {coverUrl && (
            <div className="game-info-cover">
              <img src={coverUrl} alt="" className="game-info-cover-img" />
            </div>
          )}
          <div className="game-info-meta">
            <h2 className="game-info-title">{game.title}</h2>

            <div className="game-info-statcard">
              <div className="game-info-statcard-head">
                <BarChart2 size={13} />
                <span>{t("gameInfo.statsTitle")}</span>
                {lastPlayedLabel && (
                  <span className="game-info-statcard-last">
                    <CalendarClock size={11} />
                    {lastPlayedLabel}
                  </span>
                )}
              </div>
              <div className="game-info-statcard-grid">
                <div className="game-info-stat">
                  <span className="game-info-stat-value">{stats.sessionCount.toLocaleString()}</span>
                  <span className="game-info-stat-label"><Gamepad2 size={11} /> {t("gameInfo.statSessions")}</span>
                </div>
                <div className="game-info-stat">
                  <span className="game-info-stat-value">{formatDuration(stats.totalSeconds)}</span>
                  <span className="game-info-stat-label"><Clock size={11} /> {t("gameInfo.statTotalTime")}</span>
                </div>
              </div>
              {!hasStats && <p className="game-info-statcard-empty">{t("gameInfo.statsEmpty")}</p>}
            </div>

            {requiredPaidMembershipTier && (
              <div className="game-info-membership-warning" role="note">
                <span className="game-info-membership-icon" aria-hidden="true"><Crown size={17} /></span>
                <span>
                  <strong>{t("gameDetails.premiumRequired")}</strong>
                  <span>{t("gameDetails.freeTierUnavailable", { tier: requiredPaidMembershipTier })}</span>
                </span>
              </div>
            )}

            <p className={`game-info-desc${descriptionExpanded ? " is-expanded" : ""}`}>
              {description}
            </p>
            {description.length > 260 && (
              <button
                type="button"
                className="game-detail-readmore"
                onClick={() => setDescriptionExpanded((value) => !value)}
              >
                {descriptionExpanded ? t("gameInfo.showLess") : t("gameInfo.showMore")}
              </button>
            )}

            {metadata.length > 0 && (
              <section className="game-info-meta-list" aria-label={t("gameDetails.details")}>
                {metadata.map((row) => <li key={row}>{row}</li>)}
              </section>
            )}

            {storeOptions.length > 0 && (
              <section className="game-info-store-section" aria-label={t("library.chooseStore")}>
                <h3 className="game-info-section-label">{t("library.chooseStore")}</h3>
                <div className="game-info-store-row">
                  {storeOptions.map((option) => {
                    const StoreIcon = getStoreIconComponent(option.store);
                    const storeName = getStoreDisplayName(option.store);
                    const ownershipLabel = option.isOwned ? t("gameCard.owned") : t("gameDetails.notOwned");
                    return (
                      <button
                        key={option.storeKey}
                        type="button"
                        className={`game-info-store-option${option.isActive ? " active" : ""}${option.isOwned ? "" : " not-owned"}`}
                        onClick={() => handleSelectVariant(option.variantId)}
                        aria-pressed={option.isActive}
                        aria-label={t("gameDetails.storeOption", { store: storeName, ownership: ownershipLabel })}
                      >
                        <StoreIcon />
                        <span>{storeName}</span>
                        <span className="game-info-store-ownership">
                          {option.isOwned && <Check size={11} aria-hidden="true" />}
                          {ownershipLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="game-info-actions">
              {isActiveGame ? (
                <>
                  <button className="game-info-btn game-info-btn--resume" onClick={onResume}>
                    <PlayCircle size={15} /> {t("gameInfo.resume")}
                  </button>
                  <button className="game-info-btn game-info-btn--quit" onClick={onTerminate}>
                    <Square size={13} /> {t("gameInfo.quit")}
                  </button>
                </>
              ) : (
                <button className="game-info-btn game-info-btn--play" onClick={onPlay}>
                  {requiredPaidMembershipTier && <LockKeyhole size={14} />}
                  <PlayCircle size={15} />
                  {activeStoreOption
                    ? t("gameDetails.playOn", { store: getStoreDisplayName(activeStoreOption.store) })
                    : t("gameInfo.playNow")}
                </button>
              )}
              <button className={`game-info-btn game-info-btn--fav${fav ? " favd" : ""}`} onClick={handleFavorite}>
                <Heart size={13} fill={fav ? "currentColor" : "none"} />
                {fav ? t("gameInfo.removeFromFavorites") : t("gameInfo.addToFavorites")}
              </button>
              {activeStoreOption && (
                <span className="game-info-selected-store" title={activeStoreOption.store}>
                  <ExternalLink size={12} /> {getStoreDisplayName(activeStoreOption.store)}
                </span>
              )}
            </div>
          </div>
        </div>
      </m.div>
    </div>
  );
}
