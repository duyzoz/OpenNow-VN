import assert from "node:assert/strict";
import test from "node:test";

import type { NativeStreamStats } from "@shared/gfn";

import { defaultDiagnostics, mergeNativeStreamStats } from "./streamDiagnostics";

function nativeStats(overrides: Partial<NativeStreamStats> = {}): NativeStreamStats {
  return {
    codec: "H264",
    resolution: "1920x1080",
    hardwareAcceleration: "D3D11",
    bitrateKbps: 12_000,
    targetBitrateKbps: 15_000,
    bitratePerformancePercent: 80,
    decodedFps: 60,
    renderFps: 60,
    framesDecoded: 120,
    framesRendered: 120,
    zeroCopyD3D11: true,
    zeroCopyD3D12: false,
    ...overrides,
  };
}

test("maps NativeStream stdin pressure into existing input diagnostics", () => {
  const current = {
    ...defaultDiagnostics(),
    inputQueuePeakBufferedBytes: 2_048,
  };

  const diagnostics = mergeNativeStreamStats(current, nativeStats({
    inputPipeBufferedBytes: 12_288,
    inputCoalescedMotionCount: 7,
    inputMotionPending: true,
  }));

  assert.equal(diagnostics.inputQueueBufferedBytes, 12_288);
  assert.equal(diagnostics.inputQueuePeakBufferedBytes, 12_288);
  assert.equal(diagnostics.inputQueueDropCount, 7);
});

test("retains NativeStream input queue peak when a later heartbeat drains", () => {
  const current = {
    ...defaultDiagnostics(),
    inputQueuePeakBufferedBytes: 12_288,
  };

  const diagnostics = mergeNativeStreamStats(current, nativeStats({
    inputPipeBufferedBytes: 0,
    inputCoalescedMotionCount: 7,
  }));

  assert.equal(diagnostics.inputQueueBufferedBytes, 0);
  assert.equal(diagnostics.inputQueuePeakBufferedBytes, 12_288);
  assert.equal(diagnostics.inputQueueDropCount, 7);
});
