import type { StreamLagReason } from "./streamDiagnosticsTypes";

export type FrameDropClass = "network" | "decoder" | "render" | "unknown";

export interface FrameDropClassification {
  className: FrameDropClass;
  detail: string;
}

export interface ClassifyFrameDropParams {
  framesReceived: number;
  framesDecoded: number;
  framesDropped: number;
  packetLossPercent: number;
  jitterMs: number;
  jitterBufferDelayMs: number;
  decoderPressureActive: boolean;
  decoderBacklogFrames: number;
  decodeFps: number;
  renderFps: number;
}

/**
 * Attribute cumulative frame drops to the most likely local/transport cause.
 * This is diagnostic-only: it never changes bitrate, buffering, or packet flow.
 */
export function classifyFrameDropCause(params: ClassifyFrameDropParams): FrameDropClassification {
  const hasDropSample = params.framesReceived > 0 && params.framesDropped > 0;
  if (!hasDropSample) {
    return { className: "unknown", detail: "No dropped-frame sample" };
  }

  if (params.packetLossPercent >= 1 || params.jitterMs >= 12 || params.jitterBufferDelayMs >= 20) {
    return {
      className: "network",
      detail: `loss ${params.packetLossPercent.toFixed(1)}% · jitter ${params.jitterMs.toFixed(1)}ms`,
    };
  }

  if (params.decoderPressureActive || params.decoderBacklogFrames >= 45) {
    return {
      className: "decoder",
      detail: params.decoderBacklogFrames >= 45
        ? `decoder backlog ${params.decoderBacklogFrames}`
        : "decoder pressure",
    };
  }

  if (
    params.renderFps > 0
    && params.decodeFps > 0
    && params.renderFps < params.decodeFps * 0.8
  ) {
    return {
      className: "render",
      detail: `render ${params.renderFps}fps vs decode ${params.decodeFps}fps`,
    };
  }

  return { className: "unknown", detail: "Dropped frames without a dominant signal" };
}

export interface ClassifyStreamLagReasonParams {
  framesReceived: number;
  framesDecoded: number;
  decodeTimeMs: number;
  decodeFps: number;
  renderFps: number;
  rttMs: number;
  packetLossPercent: number;
  jitterMs: number;
  jitterBufferDelayMs: number;
  inputQueueBufferedBytes: number;
  inputQueueDropCount: number;
  decoderPressureActive: boolean;
  decoderPressureReason: string;
  decoderBacklogFrames: number;
  dropRatePercent: number;
  backpressureThresholdBytes: number;
}

/** Classify overlay lag warnings using sustained pressure signals, not timer jitter or normal decode times. */
export function classifyStreamLagReason(
  params: ClassifyStreamLagReasonParams,
): { reason: StreamLagReason; detail: string } {
  const networkSignals: string[] = [];
  if (params.packetLossPercent >= 1) networkSignals.push(`${params.packetLossPercent.toFixed(1)}% loss`);
  if (params.rttMs >= 75) networkSignals.push(`RTT ${params.rttMs.toFixed(0)}ms`);
  if (params.jitterMs >= 12) networkSignals.push(`jitter ${params.jitterMs.toFixed(1)}ms`);
  if (params.jitterBufferDelayMs >= 20) networkSignals.push(`buffer ${params.jitterBufferDelayMs.toFixed(1)}ms`);
  if (networkSignals.length > 0) {
    return {
      reason: "network",
      detail: networkSignals.join(" · "),
    };
  }

  const severeDecoderStall = params.framesReceived > 100 && params.framesDecoded === 0;
  if (params.decoderPressureActive || severeDecoderStall) {
    const detailParts: string[] = [];
    if (severeDecoderStall) detailParts.push("frames received but not decoded");
    if (params.decoderPressureReason === "decode_saturated" && params.decodeTimeMs > 0) {
      detailParts.push(`decode ${params.decodeTimeMs.toFixed(1)}ms`);
    }
    if (params.decoderBacklogFrames >= 45) detailParts.push(`backlog ${params.decoderBacklogFrames}`);
    if (params.dropRatePercent >= 6) detailParts.push(`${params.dropRatePercent.toFixed(1)}% drops`);
    if (detailParts.length === 0 && params.decoderPressureReason !== "stable") {
      detailParts.push(params.decoderPressureReason.replace(/_/g, " "));
    }
    return {
      reason: "decoder",
      detail: detailParts.join(" · ") || "decode pressure",
    };
  }

  if (
    params.inputQueueDropCount > 0
    || params.inputQueueBufferedBytes >= params.backpressureThresholdBytes
  ) {
    const detailParts: string[] = [];
    if (params.inputQueueDropCount > 0) detailParts.push(`drops ${params.inputQueueDropCount}`);
    if (params.inputQueueBufferedBytes >= params.backpressureThresholdBytes) {
      detailParts.push(`buffered ${(params.inputQueueBufferedBytes / 1024).toFixed(1)}KB`);
    }
    return {
      reason: "input_backpressure",
      detail: detailParts.join(" · "),
    };
  }

  if (params.renderFps > 0 && params.decodeFps > 0) {
    const renderGap = params.decodeFps - params.renderFps;
    const renderGapPercent = renderGap / params.decodeFps;
    // Absolute fps gaps are misleading at 120/240fps streams — require a large relative drop.
    const renderPressure =
      params.renderFps < 30
      || (renderGap >= 20 && renderGapPercent >= 0.2);
    if (renderPressure) {
      return {
        reason: "render",
        detail: `render ${params.renderFps}fps vs decode ${params.decodeFps}fps`,
      };
    }
  }

  return {
    reason: params.decodeFps > 0 || params.renderFps > 0 ? "stable" : "unknown",
    detail: params.decodeFps > 0 || params.renderFps > 0
      ? "No dominant lag source detected"
      : "Waiting for stream stats",
  };
}
