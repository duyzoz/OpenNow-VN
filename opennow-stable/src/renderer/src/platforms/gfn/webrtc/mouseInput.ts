export interface AdaptiveMouseFlushDecisionParams {
  baseIntervalMs: number;
  currentIntervalMs: number;
  reliableBufferedAmount: number;
  schedulingDelayMs: number;
  canUsePartiallyReliableMouse: boolean;
  /** Optional PR-channel pressure; absent keeps the pre-Wave-10 behavior. */
  partiallyReliableBufferedAmount?: number;
  /** Age of the oldest queued mouse batch, in milliseconds. */
  batchAgeMs?: number;
  batchAgeThresholdMs?: number;
  backpressureThresholdBytes: number;
  minIntervalMs: number;
  maxIntervalMs: number;
}

export function chooseAdaptiveMouseFlushInterval(params: AdaptiveMouseFlushDecisionParams): number {
  const boundedBase = Math.max(params.minIntervalMs, Math.min(params.maxIntervalMs, params.baseIntervalMs));
  const boundedCurrent = Math.max(params.minIntervalMs, Math.min(params.maxIntervalMs, params.currentIntervalMs));
  const partiallyReliableBufferedAmount = Math.max(0, params.partiallyReliableBufferedAmount ?? 0);
  const batchAgeMs = Math.max(0, params.batchAgeMs ?? 0);
  const batchAgeThresholdMs = Math.max(8, params.batchAgeThresholdMs ?? 20);

  // Wave 10 only coalesces under a real backlog. This keeps the normal PR path at
  // the official 4/8/16 ms cadence and does not touch packet serialization.
  const activeChannelBufferedAmount = params.canUsePartiallyReliableMouse
    ? partiallyReliableBufferedAmount
    : params.reliableBufferedAmount;
  const highPressure =
    activeChannelBufferedAmount >= params.backpressureThresholdBytes / 2
    || params.schedulingDelayMs >= 4
    || batchAgeMs >= batchAgeThresholdMs;
  if (highPressure) {
    return Math.max(boundedBase, Math.min(params.maxIntervalMs, boundedCurrent + 2));
  }

  if (params.canUsePartiallyReliableMouse) {
    return boundedBase;
  }

  const lowPressure = params.reliableBufferedAmount <= 4096
    && partiallyReliableBufferedAmount <= 4096
    && params.schedulingDelayMs <= 1
    && batchAgeMs <= 4;
  if (lowPressure) {
    return Math.max(params.minIntervalMs, boundedCurrent - 1);
  }

  if (boundedCurrent > boundedBase) {
    return Math.max(boundedBase, boundedCurrent - 1);
  }
  if (boundedCurrent < boundedBase) {
    return Math.min(boundedBase, boundedCurrent + 1);
  }
  return boundedCurrent;
}

/** Coalesce pointer samples like official GFN wm() when bursts are large. */
export function subsampleCoalescedPointerEvents<T extends { movementX: number; movementY: number }>(
  samples: readonly T[],
  pendingBatchEntries: number,
  maxBatchEntries: number = 16,
): { events: T[]; stride: number } {
  if (samples.length <= 1) {
    return { events: [...samples], stride: 1 };
  }

  const budget = samples.length > 2 * maxBatchEntries
    ? 1
    : Math.max(maxBatchEntries - pendingBatchEntries - 4, 1);
  if (samples.length <= budget) {
    return { events: [...samples], stride: 1 };
  }

  const stride = Math.ceil(samples.length / budget);
  const events: T[] = [];
  for (let index = 0; index < samples.length; index += stride) {
    const end = Math.min(index + stride, samples.length);
    let movementX = 0;
    let movementY = 0;
    for (let sampleIndex = index; sampleIndex < end; sampleIndex += 1) {
      movementX += samples[sampleIndex]!.movementX;
      movementY += samples[sampleIndex]!.movementY;
    }
    events.push({
      ...samples[end - 1]!,
      movementX,
      movementY,
    } as T);
  }
  return { events, stride };
}

export function quantizeMouseDeltaWithResidual(accumulatedDelta: number): { send: number; residual: number } {
  const send = Math.round(accumulatedDelta);
  return {
    send,
    residual: accumulatedDelta - send,
  };
}

/** Filters noisy/outlier relative mouse deltas before they enter the send path. */
export class MouseDeltaFilter {
  private x = 0;
  private y = 0;
  private lastTsMs = 0;
  private velocityX = 0;
  private velocityY = 0;
  private rejectedX = 0;
  private rejectedY = 0;
  private pendingX = 0;
  private pendingY = 0;
  private sawZero = false;
  private relaxedForRawInput = false;

  public setRelaxedForRawInput(value: boolean): void {
    this.relaxedForRawInput = value;
  }

  public getX(): number {
    return this.x;
  }

  public getY(): number {
    return this.y;
  }

  public reset(): void {
    this.x = 0;
    this.y = 0;
    this.lastTsMs = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.rejectedX = 0;
    this.rejectedY = 0;
    this.pendingX = 0;
    this.pendingY = 0;
    this.sawZero = false;
  }

  public update(dx: number, dy: number, tsMs: number): boolean {
    if (dx === 0 && dy === 0) {
      if (this.sawZero) {
        this.pendingX = 0;
        this.pendingY = 0;
      } else {
        this.sawZero = true;
      }
      return false;
    }

    this.sawZero = false;
    if (this.pendingX === 0 && this.pendingY === 0) {
      if (tsMs < this.lastTsMs) {
        this.pendingX = dx;
        this.pendingY = dy;
        return false;
      }
    } else {
      dx += this.pendingX;
      dy += this.pendingY;
      this.pendingX = 0;
      this.pendingY = 0;
    }

    const dot = dx * this.x + dy * this.y;
    const magIncoming = dx * dx + dy * dy;
    const magPrev = this.x * this.x + this.y * this.y;
    let accept = true;

    const dtMs = tsMs - this.lastTsMs;
    const directionReversalCosineThreshold = this.relaxedForRawInput ? 0.89 : 0.81;
    if (dtMs < 0.95 && dot < 0 && magPrev !== 0 && dot * dot > directionReversalCosineThreshold * magIncoming * magPrev) {
      const ratio = Math.sqrt(magIncoming / magPrev);
      let distToInt = Math.abs(ratio - Math.trunc(ratio));
      if (distToInt > 0.5) {
        distToInt = 1 - distToInt;
      }
      const intRatioRejectThreshold = this.relaxedForRawInput ? 0.07 : 0.1;
      if (distToInt < intRatioRejectThreshold) {
        accept = false;
      }
    }

    const diffX = dx - this.x;
    const diffY = dy - this.y;
    const diffMag = diffX * diffX + diffY * diffY;

    if (accept) {
      const scale = 1 + 0.1 * Math.max(1, Math.min(16, dtMs));
      const vx2 = 2 * scale * Math.abs(this.velocityX);
      const vy2 = 2 * scale * Math.abs(this.velocityY);
      const threshold = Math.max(this.relaxedForRawInput ? 9800 : 8100, vx2 * vx2 + vy2 * vy2);
      accept = diffMag < threshold;
      if (!accept && (this.rejectedX !== 0 || this.rejectedY !== 0)) {
        const rx = dx - this.rejectedX;
        const ry = dy - this.rejectedY;
        accept = rx * rx + ry * ry < threshold;
      }
    }

    if (accept) {
      this.velocityX = 0.4 * this.velocityX + 0.6 * diffX;
      this.velocityY = 0.4 * this.velocityY + 0.6 * diffY;
      this.x = dx;
      this.y = dy;
      this.lastTsMs = tsMs;
      this.rejectedX = 0;
      this.rejectedY = 0;
      return true;
    }

    this.rejectedX = dx;
    this.rejectedY = dy;
    return false;
  }
}
