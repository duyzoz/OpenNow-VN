import type { MicState } from "../microphoneManager";

type CompatibilityQueueMode = "auto" | "fixed" | "adaptive" | "vrr";

export interface StreamDiagnostics {
  // Connection state
  connectionState: RTCPeerConnectionState | "closed";
  inputReady: boolean;
  nativeRendererActive: boolean;
  connectedGamepads: number;

  // Video stats
  resolution: string;
  codec: string;
  requestedCodec: string;
  hardwareAcceleration: string;
  colorCodec: string;
  isHdr: boolean;
  bitrateKbps: number;
  targetBitrateKbps: number;
  availableBitrateKbps: number;
  decodeFps: number;
  receiveFps: number;
  renderFps: number;
  gameFps?: number;

  // Network stats
  packetsLost: number;
  packetsReceived: number;
  packetLossPercent: number;
  jitterMs: number;
  rttMs: number;
  transportType: "udp" | "tcp" | "unknown";
  localCandidateType: string;

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

  lagReason: StreamLagReason;
  lagReasonDetail: string;

  // System info
  gpuType: string;
  serverGpuType: string;
  sessionId: string;
  serverRegion: string;
  serverZone: string;
  serverLocation: string;

  // Decoder recovery status
  decoderPressureActive: boolean;
  decoderRecoveryAttempts: number;
  decoderRecoveryAction: string;
  nativeRequestedFps?: number;
  nativeCapsFramerate?: string;
  nativeQueueMode?: CompatibilityQueueMode;
  nativeFramesPendingToPresent?: number;
  nativePartialFlushCount?: number;
  nativeCompleteFlushCount?: number;
  nativeTransitionSummary?: string;
  nativeRequestedStreamingFeaturesSummary?: string;
  nativeFinalizedStreamingFeaturesSummary?: string;

  // Optional diagnostics retained for HUD compatibility; upstream WebRTC does not mutate them.
  mouseBatchAgeMs?: number;
  mouseBatchEntries?: number;
  frameAgeMs?: number;
  framePacingVarianceMs?: number;
  presentationMode?: string;
  presentationStableSamples?: number;
  presentationRollbackCount?: number;
  videoAudioOffsetMs?: number;
  audioContextBaseLatencyMs?: number;
  audioContextOutputLatencyMs?: number;
  audioOutputMode?: "direct" | "audio_context" | "none";
  audioContextState?: string;
  audioSampleRate?: number;
  audioCurrentTime?: number;
  videoCurrentTime?: number;
  decoderPressureReason?: string;
  decoderBacklogFrames?: number;
  decoderDropRatePercent?: number;
  bitrateAdaptationState?: string;
  bitrateCeilingKbps?: number;
  bitrateEwmaKbps?: number;
  bitrateCeilingHeadroomPercent?: number;
  frameDropClass?: string;
  frameDropClassDetail?: string;
  mousePressureGuardActive?: boolean;
  mousePressureGuardReason?: string;
  mousePressureGuardSamples?: number;
  cursorCalibrationScaleX?: number;
  cursorCalibrationScaleY?: number;
  cursorCalibrationRoundingPx?: number;
  routeMeasurementLabel?: string;
  routeMeasurementSamples?: number;
  routeMeasurementConfidence?: string;
  routeMeasurementDeltaRttMs?: number;
  routeMeasurementDeltaJitterMs?: number;

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
