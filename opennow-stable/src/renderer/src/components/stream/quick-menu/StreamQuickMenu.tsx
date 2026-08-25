import { useRef } from "react";
import { useTranslation } from "../../../i18n";
import type { Dispatch, JSX, RefObject, SetStateAction } from "react";
import { Bug, Gauge, Images, Keyboard, LogOut, Save, SlidersHorizontal, Trash2, X } from "lucide-react";
import type {
  MicrophoneMode,
  RecordingFps,
  RecordingResolution,
  SubscriptionInfo,
  VideoShaderSettings,
} from "@shared/gfn";
import SideBar from "../../SideBar";
import type { StreamDiagnosticsStore } from "../../../utils/streamDiagnosticsStore";
import { useMicMeter } from "../../../hooks/useMicMeter";
import type { useScreenshotGallery } from "../../../hooks/useScreenshotGallery";
import type { useStreamRecorder } from "../../../hooks/useStreamRecorder";
import type { StreamMenuTab } from "../../../hooks/useStreamMenuNavigation";
import { StreamQuickMenuControlsPage } from "./StreamQuickMenuControlsPage";
import { StreamQuickMenuMediaPage } from "./StreamQuickMenuMediaPage";
import { StreamQuickMenuSessionPage } from "./StreamQuickMenuSessionPage";
import {
  StreamQuickMenuShortcutsPage,
  type StreamShortcutBindings,
  useStreamQuickMenuShortcuts,
} from "./StreamQuickMenuShortcutsPage";

interface StreamQuickMenuProps {
  open: boolean;
  onClose: () => void;
  sidebarRef: RefObject<HTMLElement | null>;
  activeTab: StreamMenuTab;
  setActiveTab: Dispatch<SetStateAction<StreamMenuTab>>;
  onEndSession: () => void;
  onReportBug: () => void;
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
  showSessionTimeRemainingInStatsOverlay: boolean;
  onShowSessionTimeRemainingInStatsOverlayChange: (value: boolean) => void;
  sidebarToggleShortcutDisplay: string;
  controllerSidebarShortcutDisplay: string;
  mouseSensitivity: number;
  onMouseSensitivityChange: (value: number) => void;
  mouseAcceleration: number;
  onMouseAccelerationChange: (value: number) => void;
  gstreamerEnabled: boolean;
  videoShader: VideoShaderSettings;
  onVideoShaderChange: (value: VideoShaderSettings) => void;
  microphoneMode: MicrophoneMode;
  onMicrophoneModeChange: (value: MicrophoneMode) => void;
  diagnosticsStore: StreamDiagnosticsStore;
  micTrack: MediaStreamTrack | null;
  shortcuts: StreamShortcutBindings;
  isMacClient: boolean;
  onScreenshotShortcutChange: (value: string) => void;
  onRecordingShortcutChange: (value: string) => void;
  screenshotGallery: ReturnType<typeof useScreenshotGallery>;
  streamRecorder: ReturnType<typeof useStreamRecorder>;
  recordingBitrateMbps: number | null;
  recordingResolution: RecordingResolution;
  recordingFps: RecordingFps;
  onRecordingResolutionChange: (value: RecordingResolution) => void;
  onRecordingFpsChange: (value: RecordingFps) => void;
  onRecordingBitrateMbpsChange: (value: number | null) => void;
}

export function StreamQuickMenu({
  open,
  onClose,
  sidebarRef,
  activeTab,
  setActiveTab,
  onEndSession,
  onReportBug,
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
  showSessionTimeRemainingInStatsOverlay,
  onShowSessionTimeRemainingInStatsOverlayChange,
  sidebarToggleShortcutDisplay,
  controllerSidebarShortcutDisplay,
  mouseSensitivity,
  onMouseSensitivityChange,
  mouseAcceleration,
  onMouseAccelerationChange,
  gstreamerEnabled,
  videoShader,
  onVideoShaderChange,
  microphoneMode,
  onMicrophoneModeChange,
  diagnosticsStore,
  micTrack,
  shortcuts,
  isMacClient,
  onScreenshotShortcutChange,
  onRecordingShortcutChange,
  screenshotGallery,
  streamRecorder,
  recordingBitrateMbps,
  recordingResolution,
  recordingFps,
  onRecordingResolutionChange,
  onRecordingFpsChange,
  onRecordingBitrateMbpsChange,
}: StreamQuickMenuProps): JSX.Element {
  const { t } = useTranslation();
  const micMeterRef = useRef<HTMLCanvasElement | null>(null);
  useMicMeter(micMeterRef, micTrack, open && microphoneMode !== "disabled");
  const shortcutEditor = useStreamQuickMenuShortcuts({
    shortcuts,
    isMacClient,
    onScreenshotShortcutChange,
    onRecordingShortcutChange,
  });

  return (
    <>
      {open && (
        <div
          className="sv-sidebar-backdrop"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onClose}
        />
      )}
      {open && (
        <SideBar
            key="quick-menu-sidebar"
            title={t("stream.quickMenu.title")}
            className="sv-sidebar"
            elementRef={sidebarRef}
            onClose={onClose}
            footer={(
              <>
                <div className="sidebar-controller-hints" aria-hidden="true">
                  <span><kbd>A</kbd> {t("stream.quickMenu.controller.select")}</span>
                  <span><kbd>B</kbd> {t("stream.quickMenu.controller.back")}</span>
                  <span><kbd>LB</kbd><kbd>RB</kbd> {t("stream.quickMenu.controller.pages")}</span>
                </div>
                <button
                  type="button"
                  className="sidebar-report-bug-button"
                  onClick={onReportBug}
                >
                  <Bug size={16} />
                  <span>{t("stream.quickMenu.reportBug")}</span>
                </button>
                <button
                  type="button"
                  className="sidebar-exit-session-button"
                  onClick={onEndSession}
                >
                  <LogOut size={16} />
                  <span>{t("stream.quickMenu.endSession")}</span>
                </button>
              </>
            )}
          >
            <div className="sidebar-tabs" role="tablist" aria-label={t("stream.quickMenu.pagesLabel")}>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "session"}
                className={`sidebar-tab${activeTab === "session" ? " sidebar-tab--active" : ""}`}
                onClick={() => setActiveTab("session")}
              >
                <Gauge size={16} />
                <span>{t("stream.quickMenu.tabs.session")}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "controls"}
                className={`sidebar-tab${activeTab === "controls" ? " sidebar-tab--active" : ""}`}
                onClick={() => setActiveTab("controls")}
              >
                <SlidersHorizontal size={16} />
                <span>{t("stream.quickMenu.tabs.controls")}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "media"}
                className={`sidebar-tab${activeTab === "media" ? " sidebar-tab--active" : ""}`}
                onClick={() => setActiveTab("media")}
              >
                <Images size={16} />
                <span>{t("stream.quickMenu.tabs.media")}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "shortcuts"}
                className={`sidebar-tab${activeTab === "shortcuts" ? " sidebar-tab--active" : ""}`}
                onClick={() => setActiveTab("shortcuts")}
              >
                <Keyboard size={16} />
                <span>{t("stream.quickMenu.tabs.keys")}</span>
              </button>
            </div>

            {activeTab === "session" && (
              <StreamQuickMenuSessionPage
                gameTitle={gameTitle}
                antiAfkEnabled={antiAfkEnabled}
                platformName={platformName}
                PlatformIcon={PlatformIcon}
                subscriptionInfo={subscriptionInfo}
                sessionStartedAtMs={sessionStartedAtMs}
                isStreaming={isStreaming}
                sessionTimeRemainingText={sessionTimeRemainingText}
                isFullscreen={isFullscreen}
                isPointerLocked={isPointerLocked}
                onToggleFullscreen={onToggleFullscreen}
                onTogglePointerLock={onTogglePointerLock}
                onToggleMicrophone={onToggleMicrophone}
                onCaptureScreenshot={() => { void screenshotGallery.captureScreenshot(); }}
                isSavingScreenshot={screenshotGallery.isSavingScreenshot}
                screenshotApiAvailable={screenshotGallery.screenshotApiAvailable}
                showSessionTimeRemainingInStatsOverlay={showSessionTimeRemainingInStatsOverlay}
                onShowSessionTimeRemainingInStatsOverlayChange={onShowSessionTimeRemainingInStatsOverlayChange}
                sidebarToggleShortcutDisplay={sidebarToggleShortcutDisplay}
                controllerSidebarShortcutDisplay={controllerSidebarShortcutDisplay}
              />
            )}

            {activeTab === "controls" && (
              <StreamQuickMenuControlsPage
                mouseSensitivity={mouseSensitivity}
                onMouseSensitivityChange={onMouseSensitivityChange}
                mouseAcceleration={mouseAcceleration}
                onMouseAccelerationChange={onMouseAccelerationChange}
                gstreamerEnabled={gstreamerEnabled}
                videoShader={videoShader}
                onVideoShaderChange={onVideoShaderChange}
                microphoneMode={microphoneMode}
                onMicrophoneModeChange={onMicrophoneModeChange}
                diagnosticsStore={diagnosticsStore}
                micTrack={micTrack}
                micMeterRef={micMeterRef}
              />
            )}

            {activeTab === "media" && (
              <StreamQuickMenuMediaPage
                screenshotShortcut={shortcuts.screenshot}
                screenshots={screenshotGallery.screenshots}
                isSavingScreenshot={screenshotGallery.isSavingScreenshot}
                screenshotApiAvailable={screenshotGallery.screenshotApiAvailable}
                galleryError={screenshotGallery.galleryError}
                galleryStripRef={screenshotGallery.galleryStripRef}
                onCaptureScreenshot={() => { void screenshotGallery.captureScreenshot(); }}
                onSelectScreenshot={screenshotGallery.setSelectedScreenshotId}
                onScrollGallery={screenshotGallery.scrollGallery}
                recordingShortcut={shortcuts.recording}
                recordings={streamRecorder.recordings}
                isRecording={streamRecorder.isRecording}
                recordingDurationMs={streamRecorder.recordingDurationMs}
                recordingError={streamRecorder.recordingError}
                recordingApiAvailable={streamRecorder.recordingApiAvailable}
                usedMimeType={streamRecorder.usedMimeType}
                recordingStatus={streamRecorder.recordingStatus}
                recordingBitrateMbps={recordingBitrateMbps}
                recordingResolution={recordingResolution}
                recordingFps={recordingFps}
                onRecordingResolutionChange={onRecordingResolutionChange}
                onRecordingFpsChange={onRecordingFpsChange}
                onRecordingBitrateMbpsChange={onRecordingBitrateMbpsChange}
                recCarouselRef={streamRecorder.recCarouselRef}
                onToggleRecording={() => { void streamRecorder.toggleRecording(); }}
                onDeleteRecording={(id) => { void streamRecorder.deleteRecording(id); }}
                onScrollRecordings={streamRecorder.scrollRecordings}
              />
            )}

            {activeTab === "shortcuts" && (
              <StreamQuickMenuShortcutsPage
                shortcuts={shortcuts}
                isMacClient={isMacClient}
                sidebarToggleShortcutDisplay={sidebarToggleShortcutDisplay}
                controllerSidebarShortcutDisplay={controllerSidebarShortcutDisplay}
                onScreenshotShortcutChange={onScreenshotShortcutChange}
                onRecordingShortcutChange={onRecordingShortcutChange}
                editor={shortcutEditor}
              />
            )}
        </SideBar>
      )}

      {screenshotGallery.selectedScreenshot && (
        <div className="sv-shot-modal" role="dialog" aria-modal="true" aria-label={t("stream.screenshots.preview")}>
          <button
            type="button"
            className="sv-shot-modal-backdrop"
            onClick={() => screenshotGallery.setSelectedScreenshotId(null)}
            aria-label={t("stream.screenshots.closePreview")}
          />
          <div className="sv-shot-modal-card">
            <div className="sv-shot-modal-head">
              <h4>{t("stream.screenshots.title")}</h4>
              <button
                type="button"
                className="sv-shot-modal-close"
                onClick={() => screenshotGallery.setSelectedScreenshotId(null)}
                aria-label={t("stream.screenshots.closePreview")}
              >
                <X size={16} />
              </button>
            </div>
            <img
              className="sv-shot-modal-image"
              src={screenshotGallery.selectedScreenshot.dataUrl}
              alt={t("stream.screenshots.alt", { fileName: screenshotGallery.selectedScreenshot.fileName })}
            />
            <div className="sv-shot-modal-actions">
              <button
                type="button"
                className="sv-shot-modal-btn"
                onClick={() => { void screenshotGallery.saveSelectedScreenshotAs(); }}
              >
                <Save size={14} />
                <span>{t("stream.screenshots.save")}</span>
              </button>
              <button
                type="button"
                className="sv-shot-modal-btn sv-shot-modal-btn--danger"
                onClick={() => { void screenshotGallery.deleteSelectedScreenshot(); }}
              >
                <Trash2 size={14} />
                <span>{t("stream.screenshots.delete")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
