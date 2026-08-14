export type PresentationLatencyMode = "adaptive" | "live_edge" | "pressure_recovery";

export interface PresentationLatencySample {
  jitterMs: number;
  packetLossPercent: number;
  frameAgeMs: number;
  framePacingVarianceMs: number;
  decoderPressureActive: boolean;
}

export interface PresentationLatencyState {
  mode: PresentationLatencyMode;
  stableSamples: number;
  rollbackCount: number;
}

interface PresentationLatencyControllerDependencies {
  onModeChange: (mode: PresentationLatencyMode) => void;
}

/**
 * Wave 3 deliberately uses a narrow, reversible live-edge gate. The normal
 * WebRTC path remains adaptive until several consecutive clean polls have
 * proved that the route and presentation pipeline are stable.
 */
export const PRESENTATION_LATENCY_LIMITS = {
  maxJitterMs: 3,
  maxPacketLossPercent: 0,
  maxFrameAgeMs: 16,
  maxPacingVarianceMs: 6,
  enableAfterStableSamples: 6,
  rollbackAfterUnstableSamples: 2,
} as const;

export class PresentationLatencyController {
  private mode: PresentationLatencyMode = "adaptive";
  private stableSamples = 0;
  private unstableSamples = 0;
  private rollbackCount = 0;

  constructor(private readonly dependencies: PresentationLatencyControllerDependencies) {}

  getState(): PresentationLatencyState {
    return {
      mode: this.mode,
      stableSamples: this.stableSamples,
      rollbackCount: this.rollbackCount,
    };
  }

  reset(): void {
    this.mode = "adaptive";
    this.stableSamples = 0;
    this.unstableSamples = 0;
    this.rollbackCount = 0;
    this.dependencies.onModeChange(this.mode);
  }

  observe(sample: PresentationLatencySample): PresentationLatencyState {
    if (sample.decoderPressureActive) {
      this.stableSamples = 0;
      this.unstableSamples = 0;
      this.setMode("pressure_recovery");
      return this.getState();
    }

    const stable = this.isStable(sample);
    if (stable) {
      this.unstableSamples = 0;
      this.stableSamples = Math.min(
        PRESENTATION_LATENCY_LIMITS.enableAfterStableSamples,
        this.stableSamples + 1,
      );
      if (
        this.mode !== "live_edge" &&
        this.stableSamples >= PRESENTATION_LATENCY_LIMITS.enableAfterStableSamples
      ) {
        this.setMode("live_edge");
      }
      return this.getState();
    }

    this.stableSamples = 0;
    this.unstableSamples += 1;
    if (
      this.mode === "live_edge" &&
      this.unstableSamples >= PRESENTATION_LATENCY_LIMITS.rollbackAfterUnstableSamples
    ) {
      this.rollbackCount += 1;
      this.setMode("adaptive");
    } else if (this.mode === "pressure_recovery") {
      this.setMode("adaptive");
    }
    return this.getState();
  }

  private isStable(sample: PresentationLatencySample): boolean {
    return Number.isFinite(sample.jitterMs)
      && sample.jitterMs >= 0
      && sample.jitterMs <= PRESENTATION_LATENCY_LIMITS.maxJitterMs
      && Number.isFinite(sample.packetLossPercent)
      && sample.packetLossPercent <= PRESENTATION_LATENCY_LIMITS.maxPacketLossPercent
      && Number.isFinite(sample.frameAgeMs)
      && sample.frameAgeMs >= 0
      && sample.frameAgeMs <= PRESENTATION_LATENCY_LIMITS.maxFrameAgeMs
      && Number.isFinite(sample.framePacingVarianceMs)
      && sample.framePacingVarianceMs >= 0
      && sample.framePacingVarianceMs <= PRESENTATION_LATENCY_LIMITS.maxPacingVarianceMs;
  }

  private setMode(mode: PresentationLatencyMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.dependencies.onModeChange(mode);
  }
}
