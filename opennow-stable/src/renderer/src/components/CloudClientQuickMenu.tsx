// Additive (v9+): Ctrl+G Quick Menu overlay for the dedicated cloud client
// window. Provides game controls without exposing the full OpenNow UI.
// Self-contained: mounts safely in either window; only renders when open.
import { useEffect, type JSX } from "react";
import { useTranslation } from "../i18n";
import { X, Maximize2, Minimize2, Square, BarChart2, Mic, MicOff } from "lucide-react";

interface CloudClientQuickMenuProps {
  open: boolean;
  onClose: () => void;
  gameTitle: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onEndSession: () => void;
  isMicMuted: boolean;
  onToggleMic: () => void;
  showStats: boolean;
  onToggleStats: () => void;
}

export function CloudClientQuickMenu({
  open,
  onClose,
  gameTitle,
  isFullscreen,
  onToggleFullscreen,
  onEndSession,
  isMicMuted,
  onToggleMic,
  showStats,
  onToggleStats,
}: CloudClientQuickMenuProps): JSX.Element | null {
  const { t } = useTranslation();

  // Close on Escape or Ctrl+G
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" || (e.ctrlKey && e.key.toLowerCase() === "g" && !e.shiftKey && !e.altKey)) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey, { capture: true });
    return () => window.removeEventListener("keydown", handleKey, { capture: true });
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="cc-qm-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={t("cloudClient.quickMenu.title")}
    >
      <div className="cc-qm-panel">
        <div className="cc-qm-header">
          <div className="cc-qm-header-left">
            <span className="cc-qm-kicker">{t("cloudClient.quickMenu.kicker")}</span>
            <span className="cc-qm-game-name" title={gameTitle}>{gameTitle}</span>
          </div>
          <button
            type="button"
            className="cc-qm-close-btn"
            onClick={onClose}
            aria-label={t("app.actions.close")}
          >
            <X size={16} />
          </button>
        </div>
        <p className="cc-qm-hint">{t("cloudClient.quickMenu.hint")}</p>
        <div className="cc-qm-actions">
          <button
            type="button"
            className={`cc-qm-btn${showStats ? " cc-qm-btn--active" : ""}`}
            onClick={() => { onToggleStats(); onClose(); }}
          >
            <BarChart2 size={20} />
            <span>{showStats ? t("stream.stats.collapse") : t("stream.stats.expand")}</span>
          </button>
          <button
            type="button"
            className={`cc-qm-btn${isMicMuted ? " cc-qm-btn--active" : ""}`}
            onClick={() => { onToggleMic(); onClose(); }}
          >
            {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
            <span>
              {isMicMuted
                ? t("stream.controls.unmuteMicrophone")
                : t("stream.controls.muteMicrophone")}
            </span>
          </button>
          <button
            type="button"
            className="cc-qm-btn"
            onClick={() => { onToggleFullscreen(); onClose(); }}
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            <span>
              {isFullscreen
                ? t("stream.controls.exitFullscreen")
                : t("stream.controls.enterFullscreen")}
            </span>
          </button>
          <button
            type="button"
            className="cc-qm-btn cc-qm-btn--danger"
            onClick={() => { onEndSession(); onClose(); }}
          >
            <Square size={20} fill="currentColor" />
            <span>{t("session.endSession")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
