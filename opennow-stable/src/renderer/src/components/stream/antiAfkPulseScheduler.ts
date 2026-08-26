export interface AntiAfkPulseTimerApi {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timer: number): void;
}

export interface AntiAfkPulseSchedulerOptions {
  initialDelayMs?: number;
  retryDelayMs?: number;
  intervalMs?: number;
}

const DEFAULT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_INTERVAL_MS = 60_000;

function normalizeDelay(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value >= 0
    ? Math.max(0, Math.floor(value))
    : fallback;
}

/**
 * Schedules the existing Anti-AFK pulse only after the input path is ready.
 * A false result means the local client was not ready; it is not treated as a
 * server acknowledgement and is retried conservatively without changing the
 * negotiated WebRTC/Native input transport.
 */
export class AntiAfkPulseScheduler {
  private timer: number | null = null;
  private running = false;
  private readonly initialDelayMs: number;
  private readonly retryDelayMs: number;
  private readonly intervalMs: number;

  constructor(
    private readonly timers: AntiAfkPulseTimerApi,
    private readonly sendPulse: () => boolean,
    options: AntiAfkPulseSchedulerOptions = {},
  ) {
    this.initialDelayMs = normalizeDelay(options.initialDelayMs, DEFAULT_INITIAL_DELAY_MS);
    this.retryDelayMs = Math.max(1, normalizeDelay(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS));
    this.intervalMs = Math.max(1, normalizeDelay(options.intervalMs, DEFAULT_INTERVAL_MS));
  }

  start(): void {
    this.stop();
    this.running = true;
    this.schedule(this.initialDelayMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      if (!this.running) return;

      let sent = false;
      try {
        sent = this.sendPulse();
      } catch {
        sent = false;
      }
      this.schedule(sent ? this.intervalMs : this.retryDelayMs);
    }, delayMs);
  }
}
