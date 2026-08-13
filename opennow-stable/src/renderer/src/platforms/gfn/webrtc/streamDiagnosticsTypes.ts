import type { MicState } from "../microphoneManager";

export interface StreamDiagnostics {
  // Connection state
  connectionState: RTCPeerConnectionState | "closed";
  inputReady: boolean;
  connectedGamepads: number;

  // Video stats
  resolution: string;
  codec: string;
  hardwareAcceleration: string;
  colorCodec: string;
  isHdr: boolean;
  bitrateKbps: number;
  targetBitrateKbps: number;
  decodeFps: number;
  renderFps: number;
  videoFrameCallbackSupported: boolean;
  videoPresentationLatencyP50Ms: number;
  videoPresentationLatencyP95Ms: number;
  videoProcessingTimeMs: number;
  videoFrameQueueDepth: number;

  // Network stats
  packetsLost: number;
  packetsReceived: number;
  packetLossPercent: number;
  jitterMs: number;
  rttMs: number;

  // Frame counters
  framesReceived: number;
  framesDecoded: number;
  framesDropped: number;

  // Timing
  decodeTimeMs: number;
  renderTimeMs: number;
  jitterBufferDelayMs: number;

  // Input channel pressure
  inputQueueBufferedBytes: number;
  inputQueuePeakBufferedBytes: number;
  partiallyReliableInputQueueBufferedBytes: number;
  partiallyReliableInputQueuePeakBufferedBytes: number;
  inputQueueDropCount: number;
  inputQueueMaxSchedulingDelayMs: number;
  inputQueueSchedulingDelayP50Ms: number;
  inputQueueSchedulingDelayP95Ms: number;
  partiallyReliableInputOpen: boolean;
  mouseMoveTransport: "reliable" | "partially_reliable";
  mouseFlushIntervalMs: number;
  mousePacketsPerSecond: number;
  mouseResidualMagnitude: number;
  /** Độ tuổi của mouse batch gần nhất lúc dispatch, chỉ phản ánh client-side queueing. */
  mouseBatchAgeMs: number;
  mouseBatchAgeP50Ms: number;
  mouseBatchAgeP95Ms: number;
  mouseAdaptiveFlushActive: boolean;

  lagReason: StreamLagReason;
  lagReasonDetail: string;

  // System info
  gpuType: string;
  serverRegion: string;

  // Decoder recovery status
  decoderPressureActive: boolean;
  decoderRecoveryAttempts: number;
  decoderRecoveryAction: string;

  // Microphone state
  micState: MicState;
  micEnabled: boolean;
}

export type StreamLagReason =
  | "unknown"
  | "stable"
  | "network"
  | "decoder"
  | "input_backpressure"
  | "render";

export interface StreamTimeWarning {
  code: 1 | 2 | 3;
  secondsLeft?: number;
}
