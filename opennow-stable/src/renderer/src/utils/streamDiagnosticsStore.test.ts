import assert from "node:assert/strict";
import test from "node:test";

import type { StreamDiagnostics } from "../platforms/gfn/webrtc/streamDiagnosticsTypes";
import { createStreamDiagnosticsStore } from "./streamDiagnosticsStore";

function makeDiagnostics(): StreamDiagnostics {
  return {
    connectionState: "connected",
    inputReady: true,
    nativeRendererActive: false,
    connectedGamepads: 0,
    resolution: "1920x1080",
    codec: "H264",
    requestedCodec: "H264",
    hardwareAcceleration: "hardware",
    colorCodec: "SDR",
    isHdr: false,
    bitrateKbps: 12000,
    targetBitrateKbps: 12000,
    availableBitrateKbps: 20000,
    decodeFps: 60,
    receiveFps: 60,
    renderFps: 60,
    packetsLost: 0,
    packetsReceived: 600,
    packetLossPercent: 0,
    jitterMs: 2,
    rttMs: 28,
    transportType: "udp",
    localCandidateType: "host",
    framesReceived: 600,
    framesDecoded: 600,
    framesDropped: 0,
    decodeTimeMs: 4,
    renderTimeMs: 1,
    jitterBufferDelayMs: 18,
    inputQueueBufferedBytes: 0,
    inputQueuePeakBufferedBytes: 0,
    partiallyReliableInputQueueBufferedBytes: 0,
    partiallyReliableInputQueuePeakBufferedBytes: 0,
    inputQueueDropCount: 0,
    inputQueueMaxSchedulingDelayMs: 0,
    partiallyReliableInputOpen: false,
    mouseMoveTransport: "reliable",
    mouseFlushIntervalMs: 8,
    mousePacketsPerSecond: 120,
    mouseResidualMagnitude: 0,
    mouseAdaptiveFlushActive: false,
    lagReason: "stable",
    lagReasonDetail: "",
    gpuType: "",
    serverGpuType: "",
    sessionId: "session-test",
    serverRegion: "",
    serverZone: "",
    serverLocation: "",
    decoderPressureActive: false,
    decoderRecoveryAttempts: 0,
    decoderRecoveryAction: "none",
    micState: "uninitialized",
    micEnabled: false,
  };
}

test("does not notify listeners for an equivalent diagnostics snapshot", () => {
  const initial = makeDiagnostics();
  const store = createStreamDiagnosticsStore(initial);
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });

  store.set({ ...initial });

  assert.equal(notifications, 0);
  assert.equal(store.getSnapshot(), initial);
});

test("notifies listeners when a diagnostics field changes", () => {
  const initial = makeDiagnostics();
  const store = createStreamDiagnosticsStore(initial);
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });

  const next = { ...initial, rttMs: 34 };
  store.set(next);

  assert.equal(notifications, 1);
  assert.equal(store.getSnapshot(), next);
});

test("does not dedupe when an optional diagnostics field appears", () => {
  const initial = makeDiagnostics();
  const store = createStreamDiagnosticsStore(initial);
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });

  const next = { ...initial, gameFps: 58 };
  store.set(next);

  assert.equal(notifications, 1);
  assert.equal(store.getSnapshot().gameFps, 58);
});
