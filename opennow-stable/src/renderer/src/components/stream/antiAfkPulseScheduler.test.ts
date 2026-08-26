import test from "node:test";
import assert from "node:assert/strict";

import { AntiAfkPulseScheduler, type AntiAfkPulseTimerApi } from "./antiAfkPulseScheduler";

interface ScheduledTimer {
  callback: () => void;
  dueAt: number;
}

class FakeTimers implements AntiAfkPulseTimerApi {
  private now = 0;
  private nextId = 1;
  private readonly timers = new Map<number, ScheduledTimer>();

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.timers.set(id, { callback, dueAt: this.now + delayMs });
    return id;
  }

  clearTimeout(timer: number): void {
    this.timers.delete(timer);
  }

  advanceBy(durationMs: number): void {
    const target = this.now + durationMs;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
      if (!next) break;

      const [id, timer] = next;
      this.now = timer.dueAt;
      this.timers.delete(id);
      timer.callback();
    }
    this.now = target;
  }

  count(): number {
    return this.timers.size;
  }
}

test("delays the first Anti-AFK pulse until input can be ready", () => {
  const timers = new FakeTimers();
  let pulses = 0;
  const scheduler = new AntiAfkPulseScheduler(timers, () => {
    pulses += 1;
    return true;
  }, { initialDelayMs: 1_000, intervalMs: 60_000 });

  scheduler.start();
  timers.advanceBy(999);
  assert.equal(pulses, 0);
  timers.advanceBy(1);
  assert.equal(pulses, 1);
  assert.equal(timers.count(), 1);
});

test("retries conservatively when the local input path is not ready", () => {
  const timers = new FakeTimers();
  let ready = false;
  let attempts = 0;
  const scheduler = new AntiAfkPulseScheduler(timers, () => {
    attempts += 1;
    return ready;
  }, { initialDelayMs: 1_000, retryDelayMs: 5_000, intervalMs: 60_000 });

  scheduler.start();
  timers.advanceBy(1_000);
  assert.equal(attempts, 1);
  timers.advanceBy(4_999);
  assert.equal(attempts, 1);
  ready = true;
  timers.advanceBy(1);
  assert.equal(attempts, 2);
  timers.advanceBy(59_999);
  assert.equal(attempts, 2);
  timers.advanceBy(1);
  assert.equal(attempts, 3);
});

test("stop cancels the pending pulse and is idempotent", () => {
  const timers = new FakeTimers();
  let pulses = 0;
  const scheduler = new AntiAfkPulseScheduler(timers, () => {
    pulses += 1;
    return true;
  });

  scheduler.start();
  scheduler.stop();
  scheduler.stop();
  timers.advanceBy(120_000);
  assert.equal(pulses, 0);
  assert.equal(timers.count(), 0);
});
