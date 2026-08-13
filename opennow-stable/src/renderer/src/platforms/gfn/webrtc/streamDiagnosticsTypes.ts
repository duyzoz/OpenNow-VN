import type { NativeQueueMode } from "@shared/gfn";
import type { MicState } from "../microphoneManager";

export interface StreamDiagnostics {
  // Connection state
  connectionState: RTCPeerConnectionState | "closed";
  inputReady: boolean;
  nativeRendererActive: boolean;
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

  // Presentation telemetry (optional for backwards-compatible fixtures)
  frameAgeMs?: number;
  framePacingVarianceMs?: number;

  lagReason: StreamLagReason;
  lagReasonDetail: string;

  // System info
  gpuType: string;
  serverRegion: string;

  // Decoder recovery status
  decoderPressureActive: boolean;
  decoderRecoveryAttempts: number;
  decoderRecoveryAction: string;
  nativeRequestedFps?: number;
  nativeCapsFramerate?: string;
  nativeQueueMode?: NativeQueueMode;
  nativeFramesPendingToPresent?: number;
  nativePartialFlushCount?: number;
  nativeCompleteFlushCount?: number;
  nativeTransitionSummary?: string;
  nativeRequestedStreamingFeaturesSummary?: string;
  nativeFinalizedStreamingFeaturesSummary?: string;

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
