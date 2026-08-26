import type { JSX } from "react";
import {
  Camera,
  Clock3,
  Gamepad2,
  Maximize,
  Mic,
  Minimize,
  MousePointer2,
} from "lucide-react";
import type { SubscriptionInfo } from "@shared/gfn";
import { RemainingPlaytimeIndicator } from "../../ElapsedSessionIndicators";
import { useTranslation } from "../../../i18n";

interface StreamQuickMenuSessionPageProps {
  gameTitle: string;
  antiAfkEnabled: boolean;
  platformName: string;
  PlatformIcon: (() => JSX.Element) | null;
  subscriptionInfo: SubscriptionInfo | null;
  sessionStartedAtMs: number | null;
  isStreaming: boolean;
  sessionTimeRemainingText: string | null;
  isFullscreen: boolean;
  isPointerLocked: boolean;
  onToggleFullscreen: () => void;
  onTogglePointerLock: () => void;
  onToggleMicrophone?: () => void;
  onCaptureScreenshot: () => void;
  isSavingScreenshot: boolean;
  screenshotApiAvailable: boolean;
  showSessionTimeRemainingInStatsOverlay: boolean;
  onShowSessionTimeRemainingInStatsOverlayChange: (value: boolean) => void;
  sidebarToggleShortcutDisplay: string;
  controllerSidebarShortcutDisplay: string;
}

export function StreamQuickMenuSessionPage({
  gameTitle,
  antiAfkEnabled,
  platformName,
  PlatformIcon,
  subscriptionInfo,
  sessionStartedAtMs,
  isStreaming,
  sessionTimeRemainingText,
  isFullscreen,
  isPointerLocked,
  onToggleFullscreen,
  onTogglePointerLock,
  onToggleMicrophone,
  onCaptureScreenshot,
  isSavingScreenshot,
  screenshotApiAvailable,
  showSessionTimeRemainingInStatsOverlay,
  onShowSessionTimeRemainingInStatsOverlayChange,
  sidebarToggleShortcutDisplay,
  controllerSidebarShortcutDisplay,
}: StreamQuickMenuSessionPageProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="sidebar-page sidebar-page--session" role="tabpanel">
      <section className="sidebar-session-card" aria-label={t("stream.quickMenu.session.currentStreamSession")}>
        <div className="sidebar-session-card-head">
          <span className="sidebar-session-kicker">{t("stream.quickMenu.session.nowStreaming")}</span>
          <div className="sidebar-session-title-row">
            <strong className="sidebar-session-title">{gameTitle}</strong>
            <span className={`sidebar-session-afk${antiAfkEnabled ? " sidebar-session-afk--on" : " sidebar-session-afk--off"}`}>
              <span className="sidebar-session-afk-dot" aria-hidden />
              {antiAfkEnabled ? t("stream.view.afkOnShort") : t("stream.view.afkOffShort")}
            </span>
          </div>
          {PlatformIcon && platformName && (
            <span className="sidebar-session-platform" title={platformName}>
              <span className="sidebar-session-platform-icon"><PlatformIcon /></span>
              <span>{platformName}</span>
            </span>
          )}
        </div>
      </section>
      <section className="sidebar-session-metrics" aria-label={t("stream.quickMenu.session.sessionTime")}>
        <div className="sidebar-metric">
          <span>{t("stream.quickMenu.session.totalPlaytimeLeft")}</span>
          <RemainingPlaytimeIndicator
            subscriptionInfo={subscriptionInfo}
            startedAtMs={sessionStartedAtMs}
            active={isStreaming}
            className="sidebar-metric-value"
          />
        </div>
        {sessionTimeRemainingText !== null && (
          <div className="sidebar-metric">
            <span>{t("sidebar.sessionTimeRemaining")}</span>
            <strong className="sidebar-metric-value">
              <Clock3 size={14} />
              {sessionTimeRemainingText}
            </strong>
          </div>
        )}
      </section>
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <span>{t("stream.quickMenu.session.sessionControls")}</span>
          <span className="sidebar-section-sub">{t("stream.quickMenu.session.sessionControlsHint")}</span>
        </div>
        <div className="sidebar-quick-actions">
          <button type="button" className="sidebar-action-card" onClick={onToggleFullscreen}>
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            <span>{isFullscreen ? t("stream.quickMenu.session.windowed") : t("stream.quickMenu.session.fullscreen")}</span>
          </button>
          <button type="button" className="sidebar-action-card" onClick={onTogglePointerLock}>
            <MousePointer2 size={16} />
            <span>{isPointerLocked ? t("stream.quickMenu.session.releaseMouse") : t("stream.quickMenu.session.captureMouse")}</span>
          </button>
          {onToggleMicrophone && (
            <button type="button" className="sidebar-action-card" onClick={onToggleMicrophone}>
              <Mic size={16} />
              <span>{t("stream.quickMenu.session.toggleMic")}</span>
            </button>
          )}
          <button
            type="button"
            className="sidebar-action-card"
            onClick={onCaptureScreenshot}
            disabled={isSavingScreenshot || !screenshotApiAvailable}
          >
            <Camera size={16} />
            <span>{isSavingScreenshot ? t("stream.quickMenu.session.capturing") : t("stream.quickMenu.session.screenshot")}</span>
          </button>
        </div>
      </section>
      {sessionTimeRemainingText !== null && (
        <label className="sidebar-setting-card sidebar-mini-toggle" tabIndex={0}>
          <span>
            <strong>{t("stream.quickMenu.session.showTimeInStats")}</strong>
            <small>{t("stream.quickMenu.session.showTimeInStatsHint")}</small>
          </span>
          <input
            type="checkbox"
            name="show-session-time-in-stats"
            checked={showSessionTimeRemainingInStatsOverlay}
            aria-label={t("sidebar.showSessionTimeRemainingInStatsOverlay")}
            onChange={(event) => onShowSessionTimeRemainingInStatsOverlayChange(event.target.checked)}
          />
          <span className="sidebar-mini-toggle-track" />
        </label>
      )}
      <div className="sidebar-open-shortcuts">
        <span><kbd>{sidebarToggleShortcutDisplay}</kbd> {t("stream.quickMenu.session.keyboard")}</span>
        <span><Gamepad2 size={14} /> {controllerSidebarShortcutDisplay}</span>
      </div>
    </div>
  );
}
