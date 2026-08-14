import type { JSX, RefObject } from "react";
import type { MicrophoneMode, VideoShaderSettings } from "@shared/gfn";
import { DEFAULT_VIDEO_SHADER_SETTINGS } from "@shared/gfn";
import type { StreamDiagnosticsStore } from "../../../utils/streamDiagnosticsStore";
import { SidebarMicMutedBadge } from "../StreamEmptyStates";

const MICROPHONE_MODES = [
  { value: "disabled" as MicrophoneMode, label: "Tắt", description: "Không sử dụng micrô" },
  { value: "push-to-talk" as MicrophoneMode, label: "Nhấn để nói", description: "Giữ phím để nói" },
  { value: "voice-activity" as MicrophoneMode, label: "Nhận diện giọng nói", description: "Luôn lắng nghe" },
];

const VIDEO_FILTER_CONTROLS = [
  { key: "sharpen", label: "Độ nét", min: 0, max: 100, neutral: 0, format: (value: number) => `${value}%`, hint: "Tăng độ nét thích ứng để giảm mờ do nén luồng." },
  { key: "saturation", label: "Độ bão hòa", min: 0, max: 200, neutral: 100, format: (value: number) => `${value}%` },
  { key: "contrast", label: "Độ tương phản", min: 50, max: 150, neutral: 100, format: (value: number) => `${value}%` },
  { key: "brightness", label: "Độ sáng", min: 50, max: 150, neutral: 100, format: (value: number) => `${value}%` },
  { key: "vibrance", label: "Màu rực", min: 0, max: 100, neutral: 0, format: (value: number) => `${value}%`, hint: "Tăng màu dịu mà không làm quá bão hòa." },
  { key: "filmGrain", label: "Hạt phim", min: 0, max: 100, neutral: 0, format: (value: number) => `${value}%` },
] as const;

interface StreamQuickMenuControlsPageProps {
  mouseSensitivity: number;
  onMouseSensitivityChange: (value: number) => void;
  mouseAcceleration: number;
  onMouseAccelerationChange: (value: number) => void;
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
  videoShader,
  onVideoShaderChange,
  microphoneMode,
  onMicrophoneModeChange,
  diagnosticsStore,
  micTrack,
  micMeterRef,
}: StreamQuickMenuControlsPageProps): JSX.Element {
  return (
    <div className="sidebar-page" role="tabpanel">
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Tùy chỉnh chuột</span>
          <span className="sidebar-section-sub">Tinh chỉnh chuyển động con trỏ.</span>
        </div>
        <div className="sidebar-row sidebar-row--column">
          <div className="sidebar-row-top">
            <span className="sidebar-label">Độ nhạy chuột</span>
            <span className="settings-value-badge">{mouseSensitivity.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            name="mouse-sensitivity"
            aria-label="Độ nhạy chuột"
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
          <span className="sidebar-hint">Hệ số áp dụng cho chuyển động chuột (1,00 = mặc định).</span>
        </div>
        <div className="sidebar-row sidebar-row--column">
          <div className="sidebar-row-top">
            <span className="sidebar-label">Tăng tốc chuột</span>
            <span className="settings-value-badge">{Math.round(mouseAcceleration)}%</span>
          </div>
          <input
            type="range"
            name="mouse-acceleration"
            aria-label="Tăng tốc chuột"
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
          <span className="sidebar-hint">Mức tăng tốc xoay động (1% = gần tắt, 150% = mạnh nhất).</span>
        </div>
      </section>
      <div className="sidebar-separator" aria-hidden="true" />
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Bộ lọc hình ảnh</span>
          <span className="sidebar-section-sub">Shader GPU áp dụng cho luồng phát.</span>
        </div>
        <>
            <div className="sidebar-row sidebar-row--aligned">
              <span className="sidebar-label">Bật bộ lọc</span>
              <label className="sidebar-mini-toggle" title="Bật bộ lọc hậu kỳ GPU" tabIndex={0}>
                <input
                  type="checkbox"
                  name="enable-video-filters"
                  checked={videoShader.enabled}
                  aria-label="Bật bộ lọc hình ảnh"
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
                      <span className="sidebar-label">{control.label}</span>
                      <span className="settings-value-badge">{control.format(videoShader[control.key])}</span>
                    </div>
                    <input
                      type="range"
                      name={`video-filter-${control.key}`}
                      aria-label={`${control.label} video filter`}
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
                    {"hint" in control && control.hint && <span className="sidebar-hint">{control.hint}</span>}
                  </div>
                ))}
                <div className="sidebar-row sidebar-row--aligned">
                  <span className="sidebar-label">Đặt lại bộ lọc</span>
                  <button
                    type="button"
                    className="sidebar-button"
                    onClick={() => onVideoShaderChange({ ...DEFAULT_VIDEO_SHADER_SETTINGS, enabled: true })}
                  >
                    <span>Đặt lại</span>
                  </button>
                </div>
              </>
            )}
        </>
      </section>
      <div className="sidebar-separator" aria-hidden="true" />
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Âm thanh</span>
          <span className="sidebar-section-sub">Cấu hình micrô.</span>
        </div>
        <div className="sidebar-row sidebar-row--column">
          <div className="sidebar-row-top">
            <span className="sidebar-label">Chế độ micrô</span>
            <span className="settings-value-badge">
              {MICROPHONE_MODES.find((option) => option.value === microphoneMode)?.label ?? microphoneMode}
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
                <span>{option.label}</span>
              </button>
            ))}
          </div>
          <span className="sidebar-hint">
            {MICROPHONE_MODES.find((option) => option.value === microphoneMode)?.description ?? ""}
          </span>
        </div>
        {microphoneMode !== "disabled" && (
          <div className="sidebar-row sidebar-row--column">
            <div className="sidebar-row-top">
              <span className="sidebar-label">Mức gửi</span>
              <SidebarMicMutedBadge diagnosticsStore={diagnosticsStore} micTrack={micTrack} />
            </div>
            <canvas
              ref={micMeterRef}
              className="mic-meter-canvas"
              aria-label="Mức gửi micrô (người khác nghe thấy)"
            />
            {!micTrack && <span className="sidebar-hint">Micrô chưa hoạt động — hãy kiểm tra chế độ và quyền truy cập.</span>}
          </div>
        )}
      </section>
    </div>
  );
}
