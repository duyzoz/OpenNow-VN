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
      <section className="sidebar-session-card" aria-label={t("sidebar.title")}>
        <div className="sidebar-session-card-head">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="sidebar-session-kicker">{t("sidebar.nowStreaming") !== "sidebar.nowStreaming" ? t("sidebar.nowStreaming") : "Đang phát trực tuyến"}</span>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 6px",
              borderRadius: 4,
              background: "rgba(88, 217, 138, 0.15)",
              color: "#58d98a",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.04em",
              border: "1px solid rgba(88, 217, 138, 0.3)"
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#58d98a" }} />
              ANTI-AFK ON
            </span>
          </div>
          <strong className="sidebar-session-title">{gameTitle}</strong>
          {PlatformIcon && platformName && (
            <span className="sidebar-session-platform" title={platformName}>
              <span className="sidebar-session-platform-icon"><PlatformIcon /></span>
              <span>{platformName}</span>
            </span>
          )}
        </div>
      </section>
      <section className="sidebar-session-metrics" aria-label={t("sidebar.sessionTimeRemaining")}>
        <div className="sidebar-metric">
          <span>{t("sidebar.totalPlaytimeLeft") !== "sidebar.totalPlaytimeLeft" ? t("sidebar.totalPlaytimeLeft") : "Thời gian còn lại"}</span>
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
          <span>{t("sidebar.sessionControls") !== "sidebar.sessionControls" ? t("sidebar.sessionControls") : "Điều khiển phiên"}</span>
          <span className="sidebar-section-sub">{t("sidebar.manageActiveStream") !== "sidebar.manageActiveStream" ? t("sidebar.manageActiveStream") : "Quản lý luồng phát đang hoạt động."}</span>
        </div>
        <div className="sidebar-quick-actions">
          <button type="button" className="sidebar-action-card" onClick={onToggleFullscreen}>
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            <span>{isFullscreen ? t("stream.controls.exitFullscreen") : t("stream.controls.enterFullscreen")}</span>
          </button>
          <button type="button" className="sidebar-action-card" onClick={onTogglePointerLock}>
            <MousePointer2 size={16} />
            <span>{isPointerLocked ? (t("stream.controls.releaseMouse") !== "stream.controls.releaseMouse" ? t("stream.controls.releaseMouse") : "Nhả chuột") : (t("stream.controls.captureMouse") !== "stream.controls.captureMouse" ? t("stream.controls.captureMouse") : "Khóa chuột")}</span>
          </button>
          {onToggleMicrophone && (
            <button type="button" className="sidebar-action-card" onClick={onToggleMicrophone}>
              <Mic size={16} />
              <span>{t("stream.controls.toggleMicrophone") !== "stream.controls.toggleMicrophone" ? t("stream.controls.toggleMicrophone") : "Bật/Tắt Mic"}</span>
            </button>
          )}
          <button
            type="button"
            className="sidebar-action-card"
            onClick={onCaptureScreenshot}
            disabled={isSavingScreenshot || !screenshotApiAvailable}
          >
            <Camera size={16} />
            <span>{isSavingScreenshot ? "Capturing" : "Screenshot"}</span>
          </button>
        </div>
      </section>
      {sessionTimeRemainingText !== null && (
        <label className="sidebar-setting-card sidebar-mini-toggle" tabIndex={0}>
          <span>
            <strong>Show time in stats</strong>
            <small>Keep session time visible in the performance overlay.</small>
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
        <span><kbd>{sidebarToggleShortcutDisplay}</kbd> Keyboard</span>
        <span><Gamepad2 size={14} /> {controllerSidebarShortcutDisplay}</span>
      </div>
    </div>
  );
}
