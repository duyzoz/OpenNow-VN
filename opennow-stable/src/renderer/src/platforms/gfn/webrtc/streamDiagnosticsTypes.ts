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
  partiallyReliableInputOpen: boolean;
  mouseMoveTransport: "reliable" | "partially_reliable";
  mouseFlushIntervalMs: number;
  mousePacketsPerSecond: number;
  mouseResidualMagnitude: number;
  mouseAdaptiveFlushActive: boolean;
  mouseBatchAgeMs?: number;
  mouseBatchEntries?: number;

  // Presentation telemetry (optional for backwards-compatible fixtures)
  frameAgeMs?: number;
  framePacingVarianceMs?: number;
  presentationMode?: "adaptive" | "live_edge" | "pressure_recovery";
  presentationStableSamples?: number;
  presentationRollbackCount?: number;

  lagReason: StreamLagReason;
  lagReasonDetail: string;

  // System info
  gpuType: string;
  serverRegion: string;

  // Decoder recovery status
  decoderPressureActive: boolean;
  decoderRecoveryAttempts: number;
  decoderRecoveryAction: string;
  decoderPressureReason?: string;
  decoderBacklogFrames?: number;
  decoderDropRatePercent?: number;
  bitrateCeilingKbps?: number;
  bitrateEwmaKbps?: number;
  bitrateCeilingHeadroomPercent?: number;
  bitrateAdaptationState?: "unknown" | "unsupported" | "ready" | "active";
  frameDropClass?: "network" | "decoder" | "render" | "unknown";
  frameDropClassDetail?: string;
  mousePressureGuardActive?: boolean;
  mousePressureGuardReason?: "buffered_amount" | "batch_age" | "scheduling_delay" | "none";
  mousePressureGuardSamples?: number;
  cursorCalibrationScaleX?: number;
  cursorCalibrationScaleY?: number;
  cursorCalibrationRoundingPx?: number;
  routeMeasurementLabel?: "single" | "A" | "B";
  routeMeasurementSamples?: number;
  routeMeasurementDeltaRttMs?: number;
  routeMeasurementDeltaJitterMs?: number;
  routeMeasurementDeltaLossPercent?: number;
  routeMeasurementConfidence?: "low" | "medium" | "high";

  // Audio/video timing telemetry (optional for backwards-compatible native fixtures)
  audioOutputMode?: "direct" | "audio_context";
  audioContextState?: AudioContextState | "none";
  audioContextBaseLatencyMs?: number;
  audioContextOutputLatencyMs?: number;
  audioSampleRate?: number;
  audioCurrentTime?: number;
  videoCurrentTime?: number;
  videoAudioOffsetMs?: number;

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
