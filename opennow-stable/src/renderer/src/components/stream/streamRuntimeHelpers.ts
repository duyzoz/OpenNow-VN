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
  const bitrate = 20_000_000;

  for (const mimeType of supported) {
    try {
      const result = await capabilities.encodingInfo({
        type: "record",
        video: {
          contentType: mimeType,
          width,
          height,
          bitrate,
          framerate: 60,
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
