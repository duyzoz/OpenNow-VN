import type { JSX, RefObject } from "react";
import { useTranslation } from "../../../i18n";
import type { MicrophoneMode, VideoShaderSettings } from "@shared/gfn";
import { DEFAULT_VIDEO_SHADER_SETTINGS } from "@shared/gfn";
import type { StreamDiagnosticsStore } from "../../../utils/streamDiagnosticsStore";
import { SidebarMicMutedBadge } from "../StreamEmptyStates";

const MICROPHONE_MODES = [
  { value: "disabled" as MicrophoneMode, labelKey: "disabled", descriptionKey: "disabledHint" },
  { value: "push-to-talk" as MicrophoneMode, labelKey: "pushToTalk", descriptionKey: "pushToTalkHint" },
  { value: "voice-activity" as MicrophoneMode, labelKey: "voiceActivity", descriptionKey: "voiceActivityHint" },
] as const;

const VIDEO_FILTER_CONTROLS = [
  { key: "sharpen", labelKey: "sharpen", min: 0, max: 100, neutral: 0, format: (value: number) => `${value}%`, hintKey: "sharpenHint" },
  { key: "saturation", labelKey: "saturation", min: 0, max: 200, neutral: 100, format: (value: number) => `${value}%` },
  { key: "contrast", labelKey: "contrast", min: 50, max: 150, neutral: 100, format: (value: number) => `${value}%` },
  { key: "brightness", labelKey: "brightness", min: 50, max: 150, neutral: 100, format: (value: number) => `${value}%` },
  { key: "vibrance", labelKey: "vibrance", min: 0, max: 100, neutral: 0, format: (value: number) => `${value}%`, hintKey: "vibranceHint" },
  { key: "filmGrain", labelKey: "filmGrain", min: 0, max: 100, neutral: 0, format: (value: number) => `${value}%` },
] as const;

interface StreamQuickMenuControlsPageProps {
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
  micMeterRef: RefObject<HTMLCanvasElement | null>;
}

export function StreamQuickMenuControlsPage({
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
  micMeterRef,
}: StreamQuickMenuControlsPageProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="sidebar-page" role="tabpanel">
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <span>{t("stream.quickMenu.controls.mousePreferences")}</span>
          <span className="sidebar-section-sub">{t("stream.quickMenu.controls.mouseHint")}</span>
        </div>
        <div className="sidebar-row sidebar-row--column">
          <div className="sidebar-row-top">
            <span className="sidebar-label">{t("stream.quickMenu.controls.mouseSensitivity")}</span>
            <span className="settings-value-badge">{mouseSensitivity.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            name="mouse-sensitivity"
            aria-label={t("stream.quickMenu.controls.mouseSensitivityAria")}
            className="settings-slider"
            min={0.1}
            max={4}
            step={0.01}
            value={mouseSensitivity}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) {
                onMouseSensitivityChange(Math.max(0.1, Math.min(4, next)));
              }
            }}
          />
          <span className="sidebar-hint">{t("stream.quickMenu.controls.mouseSensitivityHint")}</span>
        </div>
        <div className="sidebar-row sidebar-row--column">
          <div className="sidebar-row-top">
            <span className="sidebar-label">{t("stream.quickMenu.controls.mouseAcceleration")}</span>
            <span className="settings-value-badge">{Math.round(mouseAcceleration)}%</span>
          </div>
          <input
            type="range"
            name="mouse-acceleration"
            aria-label={t("stream.quickMenu.controls.mouseAccelerationAria")}
            className="settings-slider"
            min={1}
            max={150}
            step={1}
            value={Math.round(mouseAcceleration)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) {
                onMouseAccelerationChange(Math.max(1, Math.min(150, Math.round(next))));
              }
            }}
          />
          <span className="sidebar-hint">{t("stream.quickMenu.controls.mouseAccelerationHint")}</span>
        </div>
      </section>
      <div className="sidebar-separator" aria-hidden="true" />
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <span>{t("stream.quickMenu.controls.videoFilters")}</span>
          <span className="sidebar-section-sub">{t("stream.quickMenu.controls.videoFiltersHint")}</span>
        </div>
        {gstreamerEnabled ? (
          <span className="sidebar-hint">{t("stream.quickMenu.controls.filtersUnavailableNative")}</span>
        ) : (
          <>
            <div className="sidebar-row sidebar-row--aligned">
              <span className="sidebar-label">{t("stream.quickMenu.controls.enableFilters")}</span>
              <label className="sidebar-mini-toggle" title={t("stream.quickMenu.controls.enableFiltersTitle")} tabIndex={0}>
                <input
                  type="checkbox"
                  name="enable-video-filters"
                  checked={videoShader.enabled}
                  aria-label={t("stream.quickMenu.controls.enableFiltersAria")}
                  onChange={(event) => onVideoShaderChange({ ...videoShader, enabled: event.target.checked })}
                />
                <span className="sidebar-mini-toggle-track" />
              </label>
            </div>
            {videoShader.enabled && (
              <>
                {VIDEO_FILTER_CONTROLS.map((control) => (
                  <div key={control.key} className="sidebar-row sidebar-row--column">
                    <div className="sidebar-row-top">
                      <span className="sidebar-label">{t(`stream.quickMenu.controls.${control.labelKey}`)}</span>
                      <span className="settings-value-badge">{control.format(videoShader[control.key])}</span>
                    </div>
                    <input
                      type="range"
                      name={`video-filter-${control.key}`}
                      aria-label={`${t(`stream.quickMenu.controls.${control.labelKey}`)} video filter`}
                      className="settings-slider"
                      min={control.min}
                      max={control.max}
                      step={1}
                      value={videoShader[control.key]}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next)) {
                          onVideoShaderChange({
                            ...videoShader,
                            [control.key]: Math.max(control.min, Math.min(control.max, Math.round(next))),
                          });
                        }
                      }}
                      onDoubleClick={() => onVideoShaderChange({ ...videoShader, [control.key]: control.neutral })}
                    />
                    {"hintKey" in control && control.hintKey && <span className="sidebar-hint">{t(`stream.quickMenu.controls.${control.hintKey}`)}</span>}
                  </div>
                ))}
                <div className="sidebar-row sidebar-row--aligned">
                  <span className="sidebar-label">{t("stream.quickMenu.controls.resetFilters")}</span>
                  <button
                    type="button"
                    className="sidebar-button"
                    onClick={() => onVideoShaderChange({ ...DEFAULT_VIDEO_SHADER_SETTINGS, enabled: true })}
                  >
                    <span>{t("stream.quickMenu.controls.reset")}</span>
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>
      <div className="sidebar-separator" aria-hidden="true" />
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <span>{t("stream.quickMenu.controls.audio")}</span>
          <span className="sidebar-section-sub">{t("stream.quickMenu.controls.audioHint")}</span>
        </div>
        <div className="sidebar-row sidebar-row--column">
          <div className="sidebar-row-top">
            <span className="sidebar-label">{t("stream.quickMenu.controls.microphoneMode")}</span>
            <span className="settings-value-badge">
              {(() => {
                const option = MICROPHONE_MODES.find((item) => item.value === microphoneMode);
                return option ? t(`stream.quickMenu.controls.microphoneModes.${option.labelKey}`) : microphoneMode;
              })()}
            </span>
          </div>
          <div className="sidebar-chip-row">
            {MICROPHONE_MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`sidebar-chip${microphoneMode === option.value ? " sidebar-chip--active" : ""}`}
                onClick={() => onMicrophoneModeChange(option.value)}
              >
                <span>{t(`stream.quickMenu.controls.microphoneModes.${option.labelKey}`)}</span>
              </button>
            ))}
          </div>
          <span className="sidebar-hint">
            {(() => {
              const option = MICROPHONE_MODES.find((item) => item.value === microphoneMode);
              return option ? t(`stream.quickMenu.controls.microphoneModes.${option.descriptionKey}`) : "";
            })()}
          </span>
        </div>
        {microphoneMode !== "disabled" && (
          <div className="sidebar-row sidebar-row--column">
            <div className="sidebar-row-top">
              <span className="sidebar-label">{t("stream.quickMenu.controls.sendLevel")}</span>
              <SidebarMicMutedBadge diagnosticsStore={diagnosticsStore} micTrack={micTrack} />
            </div>
            <canvas
              ref={micMeterRef}
              className="mic-meter-canvas"
              aria-label={t("stream.quickMenu.controls.microphoneSendLevel")}
            />
            {!micTrack && <span className="sidebar-hint">{t("stream.quickMenu.controls.micNotActive")}</span>}
          </div>
        )}
      </section>
    </div>
  );
}
