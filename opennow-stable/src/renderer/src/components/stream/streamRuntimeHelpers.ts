import { normalizeShortcut } from "../../shortcuts";

export const RECORDING_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=h264",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export function getShortcutConflictError(
  rawValue: string,
  reservedShortcuts: readonly (string | undefined)[],
): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "Shortcut cannot be empty.";
  }

  const normalized = normalizeShortcut(trimmed);
  if (!normalized.valid) {
    return "Invalid shortcut format.";
  }

  const reserved = reservedShortcuts
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizeShortcut(value))
    .filter((parsed) => parsed.valid)
    .map((parsed) => parsed.canonical);

  return reserved.includes(normalized.canonical)
    ? "Shortcut conflicts with an existing binding."
    : null;
}

export function selectRecordingMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string {
  return RECORDING_MIME_TYPES.find(isTypeSupported) ?? "video/webm";
}

type RecordingEncodingInfo = {
  supported: boolean;
  powerEfficient?: boolean;
};

type RecordingMediaCapabilities = {
  encodingInfo?: (configuration: unknown) => Promise<RecordingEncodingInfo>;
};

export interface RecordingMimeSelection {
  mimeType: string;
  powerEfficient: boolean;
}

export interface RecordingVideoTrack {
  track: MediaStreamTrack;
  cleanup: () => void;
  source: "video-capture" | "cloned-track";
}

type CaptureStreamVideoElement = HTMLVideoElement & {
  captureStream?: (frameRate?: number) => MediaStream;
};

/**
 * Build a recorder-only video track without feeding the original WebRTC track
 * directly into MediaRecorder. The captureStream path lets Chromium cap the
 * recorder input at 30 FPS while leaving the live video element and its
 * decoder/compositor untouched. A cloned WebRTC track is retained as a
 * compatibility fallback for Electron builds without captureStream.
 */
export async function createRecordingVideoTrack(
  video: HTMLVideoElement,
  sourceStream: MediaStream,
  maxFrameRate = 30,
): Promise<RecordingVideoTrack> {
  const captureVideo = video as CaptureStreamVideoElement;
  if (typeof captureVideo.captureStream === "function") {
    try {
      const capturedStream = captureVideo.captureStream(maxFrameRate);
      const capturedTrack = capturedStream.getVideoTracks()[0];
      if (capturedTrack) {
        capturedTrack.contentHint = "detail";
        return {
          track: capturedTrack,
          source: "video-capture",
          cleanup: () => {
            capturedStream.getTracks().forEach((track) => track.stop());
          },
        };
      }
      capturedStream.getTracks().forEach((track) => track.stop());
    } catch {
      // Continue with the cloned-track fallback below.
    }
  }

  const sourceTrack = sourceStream.getVideoTracks()[0];
  if (!sourceTrack) {
    throw new Error("No video track is available for recording.");
  }

  const clonedTrack = sourceTrack.clone();
  clonedTrack.contentHint = "detail";
  try {
    await clonedTrack.applyConstraints({
      frameRate: { ideal: maxFrameRate, max: maxFrameRate },
    });
  } catch {
    // Some remote tracks reject frame-rate constraints. The clone is still
    // isolated from the live track, so keep it as the compatibility fallback.
  }

  return {
    track: clonedTrack,
    source: "cloned-track",
    cleanup: () => clonedTrack.stop(),
  };
}

/**
 * Prefer a codec that Chromium reports as power-efficient (normally a
 * hardware-backed H.264 encoder on Windows). The synchronous selector above
 * remains the compatibility fallback for older Electron/Chromium builds.
 */
export async function selectPowerEfficientRecordingMimeType(
  isTypeSupported: (mimeType: string) => boolean,
  video: Pick<HTMLVideoElement, "videoWidth" | "videoHeight">,
): Promise<RecordingMimeSelection> {
  const supported = RECORDING_MIME_TYPES.filter(isTypeSupported);
  const fallback = supported[0] ?? "video/webm";
  const capabilities = (globalThis.navigator as Navigator | undefined)?.mediaCapabilities as
    | RecordingMediaCapabilities
    | undefined;

  if (!capabilities?.encodingInfo) {
    return { mimeType: fallback, powerEfficient: false };
  }

  const width = Math.max(1, video.videoWidth || 1920);
  const height = Math.max(1, video.videoHeight || 1080);
  const bitrate = 16_000_000;

  for (const mimeType of supported) {
    try {
      const result = await capabilities.encodingInfo({
        type: "record",
        video: {
          contentType: mimeType,
          width,
          height,
          bitrate,
          framerate: 30,
        },
      });
      if (result.supported && result.powerEfficient === true) {
        return { mimeType, powerEfficient: true };
      }
    } catch {
      // Older Chromium builds can reject a candidate even when MediaRecorder
      // supports it. Continue probing and keep the normal fallback.
    }
  }

  return { mimeType: fallback, powerEfficient: false };
}

export interface ThumbnailSize {
  width: number;
  height: number;
}

export function fitThumbnailSize(
  width: number,
  height: number,
  maxWidth = 320,
  maxHeight = 180,
): ThumbnailSize {
  let fittedWidth = width;
  let fittedHeight = height;

  if (fittedWidth > maxWidth) {
    fittedHeight = Math.round((maxWidth / fittedWidth) * fittedHeight);
    fittedWidth = maxWidth;
  }
  if (fittedHeight > maxHeight) {
    fittedWidth = Math.round((maxHeight / fittedHeight) * fittedWidth);
    fittedHeight = maxHeight;
  }

  return { width: fittedWidth, height: fittedHeight };
}
