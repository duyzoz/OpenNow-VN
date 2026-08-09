// Additive (v9+): Beautiful in-app session-ended popup for the dedicated
// cloud client window. Replaces the native OS alert that was shown before.
// Self-contained: owns its own countdown timer and never touches main-window
// state. Safe to mount unconditionally — renders nothing while `open` is false.
import { useCallback, useEffect, useState, type JSX } from "react";
import { useTranslation } from "../i18n";

interface SessionEndedPopupProps {
  open: boolean;
  gameTitle?: string;
  /** Seconds before the popup auto-dismisses (default 8). */
  countdownSeconds?: number;
  onDismiss: () => void;
}

export function SessionEndedPopup({
  open,
  gameTitle,
  countdownSeconds = 8,
  onDismiss,
}: SessionEndedPopupProps): JSX.Element | null {
  const { t } = useTranslation();
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!open) {
      setSecondsLeft(countdownSeconds);
      return undefined;
    }
    setSecondsLeft(countdownSeconds);
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          handleDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [open, countdownSeconds, handleDismiss]);

  if (!open) return null;

  return (
    <div
      className="cc-session-ended-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("cloudClient.sessionEnded.title")}
    >
      <div className="cc-session-ended-card">
        <div className="cc-session-ended-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2" opacity="0.6" />
            <path d="M24 15v10.5l6 3.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="cc-session-ended-title">{t("cloudClient.sessionEnded.title")}</h2>
        {gameTitle && (
          <p className="cc-session-ended-game">{gameTitle}</p>
        )}
        <p className="cc-session-ended-body">{t("cloudClient.sessionEnded.body")}</p>
        <p className="cc-session-ended-countdown">
          {t("cloudClient.sessionEnded.closingIn", { seconds: String(secondsLeft) })}
        </p>
        <button
          type="button"
          className="cc-session-ended-btn"
          onClick={handleDismiss}
        >
          {t("cloudClient.sessionEnded.dismiss")}
        </button>
      </div>
    </div>
  );
}
