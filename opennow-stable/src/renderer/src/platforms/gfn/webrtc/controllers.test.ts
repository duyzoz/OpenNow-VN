/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";

import {
  DecoderPressureController,
  type DecoderPressureSignal,
  type DecoderPressureState,
} from "./decoderPressureController";
import {
  selectGamepadPollIntervalMs,
  shouldSendGamepadPacket,
} from "./gamepadController";
import { InputChannelPolicyController } from "./inputChannelPolicy";
import { PresentationLatencyController } from "./presentationLatencyController";

const pressureSignal: DecoderPressureSignal = {
  active: true,
  reason: "backlog_and_drop",
  backlogFrames: 50,
  dropRatePercent: 7,
};

test("decoder recovery waits for three pressure polls and clears after six stable polls", async () => {
  const states: DecoderPressureState[] = [];
  let keyframeRequests = 0;
  const controller = new DecoderPressureController({
    log: () => {},
    getPeerConnection: () => null,
    getControlChannel: () => null,
    requestSignalingKeyframe: async () => {
      keyframeRequests++;
    },
    setMaxBitrateKbps: async () => {},
    onStateChange: (state) => states.push(state),
    now: () => 2_000,
  });

  await controller.recover(pressureSignal);
  await controller.recover(pressureSignal);
  assert.equal(keyframeRequests, 0);

  await controller.recover(pressureSignal);
  assert.equal(keyframeRequests, 1);
  assert.deepEqual(states.at(-1), {
    active: true,
    recoveryAttempts: 1,
    recoveryAction: "signaling_keyframe",
  });

  const stableSignal = { ...pressureSignal, active: false, reason: "stable" };
  for (let index = 0; index < 5; index++) {
    await controller.recover(stableSignal);
  }
  assert.equal(states.at(-1)?.active, true);

  await controller.recover(stableSignal);
  assert.deepEqual(states.at(-1), {
    active: false,
    recoveryAttempts: 0,
    recoveryAction: "none",
  });
});

test("input policy preserves partially-reliable and reliable fallback routes", () => {
  const reliablePackets: Uint8Array[] = [];
  const channelPackets: Uint8Array[] = [];
  let channelOpen = true;
  const channel = {
    get readyState() {
      return channelOpen ? "open" : "closed";
    },
    send: (payload: Uint8Array) => channelPackets.push(payload),
  } as unknown as RTCDataChannel;
  const controller = new InputChannelPolicyController(
    {
      partialReliableThresholdMs: 300,
      hidDeviceMask: 0xffff,
      enablePartiallyReliableTransferGamepad: 0xffff,
      enablePartiallyReliableTransferHid: 0xffff,
    },
    {
      getPartiallyReliableChannel: () => channel,
      sendReliable: (payload) => reliablePackets.push(payload),
    },
  );
  const payload = new Uint8Array([1, 2, 3]);

  controller.sendPartiallyReliable(payload);
  assert.equal(channelPackets.length, 1);

  channelOpen = false;
  controller.sendPartiallyReliable(payload);
  assert.deepEqual(reliablePackets, [payload]);
});

test("gamepad polling and keepalive decisions preserve adaptive timing", () => {
  assert.equal(selectGamepadPollIntervalMs({
    inputReady: false,
    visible: true,
    connectedCount: 1,
    inputBlocked: false,
  }), 100);
  assert.equal(selectGamepadPollIntervalMs({
    inputReady: true,
    visible: true,
    connectedCount: 1,
    inputBlocked: true,
  }), 16);
  assert.equal(selectGamepadPollIntervalMs({
    inputReady: true,
    visible: true,
    connectedCount: 1,
    inputBlocked: false,
  }), 4);
  assert.equal(shouldSendGamepadPacket(false, 99), false);
  assert.equal(shouldSendGamepadPacket(false, 100), true);
  assert.equal(shouldSendGamepadPacket(true, 0), true);
});

test("presentation gate enables live-edge only after clean samples and rolls back on instability", () => {
  const modes: string[] = [];
  const controller = new PresentationLatencyController({
    onModeChange: (mode) => modes.push(mode),
  });
  const clean = {
    jitterMs: 1.5,
    packetLossPercent: 0,
    frameAgeMs: 8,
    framePacingVarianceMs: 2,
    decoderPressureActive: false,
  };
  for (let index = 0; index < 5; index++) {
    assert.equal(controller.observe(clean).mode, "adaptive");
  }
  assert.equal(controller.observe(clean).mode, "live_edge");
  assert.equal(modes.at(-1), "live_edge");

  const unstable = { ...clean, jitterMs: 12 };
  controller.observe(unstable);
  const rolledBack = controller.observe(unstable);
  assert.equal(rolledBack.mode, "adaptive");
  assert.equal(rolledBack.rollbackCount, 1);
  assert.equal(modes.at(-1), "adaptive");
});

test("presentation gate enters pressure recovery immediately and returns to adaptive", () => {
  const controller = new PresentationLatencyController({ onModeChange: () => {} });
  const pressure = controller.observe({
    jitterMs: 2,
    packetLossPercent: 0,
    frameAgeMs: 8,
    framePacingVarianceMs: 2,
    decoderPressureActive: true,
  });
  assert.equal(pressure.mode, "pressure_recovery");
  const stable = controller.observe({
    jitterMs: 9,
    packetLossPercent: 0,
    frameAgeMs: 8,
    framePacingVarianceMs: 2,
    decoderPressureActive: false,
  });
  assert.equal(stable.mode, "adaptive");
});
