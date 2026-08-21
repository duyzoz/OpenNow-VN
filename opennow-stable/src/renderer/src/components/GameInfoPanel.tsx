import { X, PlayCircle, Square, ExternalLink, Heart, Gamepad2, BarChart2, Clock, CalendarClock } from "lucide-react";
import { useTranslation } from "../i18n";
import { useEffect, useState, useRef, useCallback, type JSX } from "react";
import type { GameInfo } from "@shared/gfn/catalog";
import { m } from "motion/react";
import { isFavorite, toggleFavorite } from "../lib/gamePreferences";
import {
  formatDuration,
  formatLastPlayed,
  getPlaytimeStat,
  invalidatePlaytimeCache,
} from "../lib/playtimeStats";

interface GameInfoPanelProps {
  game: GameInfo | null;
  isActiveGame?: boolean;
  onResume?: () => void;
  onTerminate?: () => void;
  onPlay?: () => void;
  onClose: () => void;
}

const descCache = new Map<string, string>();

function getPlatformLinks(game: GameInfo): Array<{ label: string; url: string; color: string }> {
  const links: Array<{ label: string; url: string; color: string }> = [];
  for (const v of (game.variants ?? [])) {
    const store = (v.store ?? "").toUpperCase();
    const id = v.id ?? "";
    if (store.includes("STEAM") && /^\d+$/.test(id)) {
      links.push({ label: "Steam", url: `https://store.steampowered.com/app/${id}`, color: "#1b2838" });
    } else if (store.includes("EPIC")) {
      links.push({ label: "Epic Games", url: "https://store.epicgames.com/", color: "#2d2d2d" });
    } else if (store.includes("XBOX") || store.includes("MICROSOFT")) {
      links.push({ label: "Xbox", url: "https://www.xbox.com/games", color: "#107c10" });
    } else if (store.includes("GOG")) {
      links.push({ label: "GOG", url: "https://www.gog.com/", color: "#7c2d8e" });
    } else if (store.includes("EA") || store.includes("ORIGIN")) {
      links.push({ label: "EA App", url: "https://www.ea.com/games", color: "#e8643b" });
    } else if (store.includes("UBISOFT") || store.includes("UPLAY")) {
      links.push({ label: "Ubisoft", url: "https://store.ubisoft.com/", color: "#0070f3" });
    }
  }
  // deduplicate by label
  const seen = new Set<string>();
  return links.filter((l) => { if (seen.has(l.label)) return false; seen.add(l.label); return true; });
}

async function fetchDescription(game: GameInfo): Promise<string> {
  if (descCache.has(game.id)) return descCache.get(game.id)!;
  const steamVariant = (game.variants ?? []).find(
    (v) => /^\d+$/.test(v.id ?? "") && (v.store ?? "").toUpperCase().includes("STEAM")
  );
  const steamId = steamVariant?.id ?? (/^\d+$/.test(game.id) ? game.id : null);
  if (steamId) {
    try {
      const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steamId}&l=vietnamese`,
        { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const desc = data[steamId]?.data?.short_description as string | undefined;
        if (desc) { descCache.set(game.id, desc); return desc; }
      }
    } catch { /* ignore */ }
  }
  const fallback = "__GAMEINFO_FALLBACK__"; // replaced at render time via t()
  descCache.set(game.id, fallback);
  return fallback;
}

export function GameInfoPanel({ game, isActiveGame = false, onResume, onTerminate, onPlay, onClose }: GameInfoPanelProps): JSX.Element {
  const { t } = useTranslation();
  const [desc, setDesc] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState(false);
  const [fav, setFav] = useState(false);
  const [favToast, setFavToast] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!game) return;
    setDesc(null);
    setImgErr(false);
    setFav(isFavorite(game.id));
    // A session may have ended since this panel was last opened.
    invalidatePlaytimeCache();
    let cancelled = false;
    fetchDescription(game).then((d) => { if (!cancelled) setDesc(d); });
    return () => { cancelled = true; };
  }, [game?.id]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleFav = useCallback(() => {
    if (!game) return;
    const nowFav = toggleFavorite(game.id);
    setFav(nowFav);
    const msg = nowFav ? t("gameInfo.favoriteAdded") : t("gameInfo.favoriteRemoved");
    setFavToast(msg);
    setTimeout(() => setFavToast(null), 2000);
  }, [game]);

  if (!game) return <></>;

  const heroUrl = game.heroImageUrl ?? (!imgErr ? game.imageUrl : undefined);
  const coverUrl = game.imageUrl;
  const platformLinks = getPlatformLinks(game);
  // Real per-game figures from the same store `usePlaytime` writes: sessionCount is
  // incremented when a stream starts, totalSeconds accumulates on session end.
  const stats = getPlaytimeStat(game.id);
  const lastPlayedLabel = formatLastPlayed(stats.lastPlayedAt);
  const hasStats = stats.sessionCount > 0 || stats.totalSeconds > 0;

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
      >
        {/* Hero */}
        <div className="game-info-hero">
          {heroUrl && !imgErr ? (
            <img src={heroUrl} alt={game.title} className="game-info-hero-img" onError={() => setImgErr(true)} loading="eager" />
          ) : (
            <div className="game-info-hero-placeholder"><Gamepad2 size={48} opacity={0.3} /></div>
          )}
          <div className="game-info-hero-overlay" />
          <button className="game-info-close" onClick={onClose} title={t("gameInfo.closeLabel")}><X size={15} /></button>
          <button
            className={`game-info-fav-btn${fav ? " active" : ""}`}
            onClick={handleFav}
            title={fav ? t("gameInfo.removeFromFavorites") : t("gameInfo.addToFavorites")}
          >
            <Heart size={16} fill={fav ? "currentColor" : "none"} />
          </button>
          {isActiveGame && (
            <div className="game-info-active-badge">
              <span className="game-info-active-pulse" />
              Đang stream
            </div>
          )}
        </div>

        {/* Content */}
        <div className="game-info-content">
          {coverUrl && (
            <div className="game-info-cover">
              <img src={coverUrl} alt={game.title} className="game-info-cover-img" />
            </div>
          )}
          <div className="game-info-meta">
            <h2 className="game-info-title">{game.title}</h2>

            {/* Rounded stats card: session count + total accumulated playtime. */}
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
                  <span className="game-info-stat-value">
                    {stats.sessionCount.toLocaleString()}
                  </span>
                  <span className="game-info-stat-label">
                    <Gamepad2 size={11} /> {t("gameInfo.statSessions")}
                  </span>
                </div>
                <div className="game-info-stat">
                  <span className="game-info-stat-value">
                    {formatDuration(stats.totalSeconds)}
                  </span>
                  <span className="game-info-stat-label">
                    <Clock size={11} /> {t("gameInfo.statTotalTime")}
                  </span>
                </div>
              </div>
              {!hasStats && (
                <p className="game-info-statcard-empty">{t("gameInfo.statsEmpty")}</p>
              )}
            </div>

            <p className="game-info-desc">{desc === "__GAMEINFO_FALLBACK__" ? t("gameInfo.fallbackDesc") : (desc ?? t("gameInfo.loadingDesc"))}</p>

            {/* Platform links */}
            {platformLinks.length > 0 && (
              <div className="game-info-platforms">
                {platformLinks.map((pl) => (
                  <a
                    key={pl.label}
                    className="game-info-platform-chip"
                    href={pl.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ background: pl.color }}
                  >
                    <ExternalLink size={10} /> {pl.label}
                  </a>
                ))}
              </div>
            )}

            {/* Actions */}
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
                  <PlayCircle size={15} /> {t("gameInfo.playNow")}
                </button>
              )}
              <button
                className={`game-info-btn game-info-btn--fav${fav ? " favd" : ""}`}
                onClick={handleFav}
              >
                <Heart size={13} fill={fav ? "currentColor" : "none"} />
                {fav ? t("gameInfo.favoriteLabel") : t("gameInfo.favoriteLabel")}
              </button>
            </div>
          </div>
        </div>
      </m.div>
    </div>
  );
}
