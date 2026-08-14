import type { JSX, RefObject } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Circle,
  FolderOpen,
  Square,
  Trash2,
  Video,
} from "lucide-react";
import type { RecordingEntry, ScreenshotEntry } from "@shared/gfn";
import { formatElapsed } from "../../../utils/timeFormat";
import { formatFileSize } from "../streamFormatters";

interface StreamQuickMenuMediaPageProps {
  screenshotShortcut: string;
  screenshots: ScreenshotEntry[];
  isSavingScreenshot: boolean;
  screenshotApiAvailable: boolean;
  galleryError: string | null;
  galleryStripRef: RefObject<HTMLDivElement | null>;
  onCaptureScreenshot: () => void;
  onSelectScreenshot: (id: string) => void;
  onScrollGallery: (direction: "left" | "right") => void;
  recordingShortcut: string;
  recordings: RecordingEntry[];
  isRecording: boolean;
  recordingDurationMs: number;
  recordingError: string | null;
  recordingApiAvailable: boolean;
  usedMimeType: string | null;
  recordingBitrateMbps: number | null;
  recCarouselRef: RefObject<HTMLDivElement | null>;
  onToggleRecording: () => void;
  onDeleteRecording: (id: string) => void;
  onScrollRecordings: (direction: "left" | "right") => void;
}

export function StreamQuickMenuMediaPage({
  screenshotShortcut,
  screenshots,
  isSavingScreenshot,
  screenshotApiAvailable,
  galleryError,
  galleryStripRef,
  onCaptureScreenshot,
  onSelectScreenshot,
  onScrollGallery,
  recordingShortcut,
  recordings,
  isRecording,
  recordingDurationMs,
  recordingError,
  recordingApiAvailable,
  usedMimeType,
  recordingBitrateMbps,
  recCarouselRef,
  onToggleRecording,
  onDeleteRecording,
  onScrollRecordings,
}: StreamQuickMenuMediaPageProps): JSX.Element {
  return (
    <div className="sidebar-page" role="tabpanel">
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Thư viện</span>
          <span className="sidebar-section-sub">Phím chụp: {screenshotShortcut}</span>
        </div>
        <div className="sidebar-row sidebar-row--aligned">
          <span className="sidebar-label">Ảnh chụp</span>
          <button
            type="button"
            className="sidebar-button sidebar-screenshot-button"
            onClick={onCaptureScreenshot}
            disabled={isSavingScreenshot || !screenshotApiAvailable}
          >
            <Camera size={14} />
            <span>{isSavingScreenshot ? "Đang chụp..." : "Chụp ảnh"}</span>
          </button>
        </div>
        <div className="sidebar-gallery-row">
          <button
            type="button"
            className="sidebar-gallery-arrow"
            onClick={() => onScrollGallery("left")}
            aria-label="Cuộn thư viện sang trái"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="sidebar-gallery-strip" ref={galleryStripRef}>
            {screenshots.map((shot) => (
              <button
                key={shot.id}
                type="button"
                className="sidebar-gallery-item"
                onClick={() => onSelectScreenshot(shot.id)}
                title={new Date(shot.createdAtMs).toLocaleString()}
              >
                <img src={shot.dataUrl} alt={`Screenshot ${shot.fileName}`} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="sidebar-gallery-arrow"
            onClick={() => onScrollGallery("right")}
            aria-label="Cuộn thư viện sang phải"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {screenshots.length === 0 && (
          <span className="sidebar-hint">Chưa có ảnh chụp. Nhấn {screenshotShortcut} để chụp.</span>
        )}
        {galleryError && <span className="sidebar-hint sidebar-hint--error">{galleryError}</span>}
      </section>
      <div className="sidebar-separator" aria-hidden="true" />
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Bản ghi</span>
          <span className="sidebar-section-sub">Phím quay: {recordingShortcut}</span>
        </div>
        {usedMimeType && (
          <span className="sidebar-hint sidebar-hint--codec">Định dạng: {usedMimeType}</span>
        )}
        <span className="sidebar-hint sidebar-hint--codec">
          Tốc độ ghi: {recordingBitrateMbps === null ? "Tự động" : `${recordingBitrateMbps} Mbps`}
        </span>
        <div className="sidebar-row sidebar-row--aligned">
          <span className="sidebar-label">
            {isRecording ? `Đang quay ${formatElapsed(Math.round(recordingDurationMs / 1000))}` : "Quay video"}
          </span>
          <button
            type="button"
            className="sidebar-button sidebar-screenshot-button"
            onClick={onToggleRecording}
            disabled={!recordingApiAvailable}
          >
            {isRecording ? <Square size={14} /> : <Circle size={14} />}
            <span>{isRecording ? "Dừng" : "Bắt đầu"}</span>
          </button>
        </div>
        {recordingError && (
          <span className="sidebar-hint sidebar-hint--error">{recordingError}</span>
        )}
        {recordings.length === 0 ? (
          <span className="sidebar-hint">Chưa có bản ghi. Nhấn {recordingShortcut} để quay.</span>
        ) : (
          <div className="sidebar-gallery-row">
            <button
              type="button"
              className="sidebar-gallery-arrow"
              onClick={() => onScrollRecordings("left")}
              aria-label="Cuộn bản ghi sang trái"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="sidebar-rec-strip" ref={recCarouselRef}>
              {recordings.map((recording) => (
                <div key={recording.id} className="sidebar-rec-card">
                  {recording.thumbnailDataUrl ? (
                    <img
                      className="sidebar-rec-card-thumb"
                      src={recording.thumbnailDataUrl}
                      alt=""
                    />
                  ) : (
                    <div className="sidebar-rec-card-thumb sidebar-rec-card-thumb--placeholder">
                      <Video size={20} />
                    </div>
                  )}
                  <div className="sidebar-rec-card-meta">
                    <span className="sidebar-rec-card-title">{recording.gameTitle ?? "Chưa đặt tên"}</span>
                    <span className="sidebar-rec-card-detail">
                      {formatElapsed(Math.round(recording.durationMs / 1000))} · {formatFileSize(recording.sizeBytes)}
                    </span>
                  </div>
                  <div className="sidebar-rec-card-actions">
                    <button
                      type="button"
                      className="sidebar-rec-card-action"
                      aria-label="Mở thư mục chứa bản ghi"
                      title="Mở thư mục"
                      onClick={() => { void window.openNow.showRecordingInFolder(recording.id); }}
                      disabled={typeof window.openNow?.showRecordingInFolder !== "function"}
                    >
                      <FolderOpen size={11} />
                    </button>
                    <button
                      type="button"
                      className="sidebar-rec-card-action sidebar-rec-card-action--danger"
                      aria-label="Xóa bản ghi"
                      title="Xóa"
                      onClick={() => onDeleteRecording(recording.id)}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="sidebar-gallery-arrow"
              onClick={() => onScrollRecordings("right")}
              aria-label="Cuộn bản ghi sang phải"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
