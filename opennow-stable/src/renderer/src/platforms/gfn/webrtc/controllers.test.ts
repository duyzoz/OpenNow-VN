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
import { DomInputCaptureController } from "./domInputCaptureController";
import { INPUT_KEY_DOWN, INPUT_MOUSE_REL } from "../inputProtocol";

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

test("adaptive jitter cushion waits for sustained jitter and clears after stable polls", () => {
  const receiver = {
    jitterBufferTarget: 0,
    playoutDelayHint: 0,
    track: {},
  } as unknown as RTCRtpReceiver;
  const controller = new DecoderPressureController({
    log: () => {},
    getPeerConnection: () => null,
    getControlChannel: () => null,
    requestSignalingKeyframe: async () => {},
    setMaxBitrateKbps: async () => {},
    onStateChange: () => {},
  });

  controller.configureReceiver(receiver, "video");
  controller.updateNetworkConditions(10, 0);
  controller.updateNetworkConditions(10, 0);
  assert.equal((receiver as unknown as { jitterBufferTarget: number }).jitterBufferTarget, 0);

  controller.updateNetworkConditions(10, 0);
  assert.equal((receiver as unknown as { jitterBufferTarget: number }).jitterBufferTarget, 8);
  assert.equal((receiver as unknown as { playoutDelayHint: number }).playoutDelayHint, 0.008);

  for (let index = 0; index < 5; index++) {
    controller.updateNetworkConditions(4, 0);
  }
  assert.equal((receiver as unknown as { jitterBufferTarget: number }).jitterBufferTarget, 8);

  controller.updateNetworkConditions(4, 0);
  assert.equal((receiver as unknown as { jitterBufferTarget: number }).jitterBufferTarget, 0);
  assert.equal((receiver as unknown as { playoutDelayHint: number }).playoutDelayHint, 0);
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

test("partial-reliable mouse drops stale motion under browser backpressure but preserves keyboard", () => {
  const reliablePackets: Uint8Array[] = [];
  const channelPackets: Uint8Array[] = [];
  let bufferedAmount = 40 * 1024;
  let bufferedAmountLowListener: () => void = () => {};
  let staleMouseDrops = 0;
  const channel = {
    readyState: "open",
    get bufferedAmount() {
      return bufferedAmount;
    },
    bufferedAmountLowThreshold: 0,
    addEventListener: (event: string, listener: () => void) => {
      if (event === "bufferedamountlow") {
        bufferedAmountLowListener = listener;
      }
    },
    removeEventListener: () => {},
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
      onMouseMotionDropped: () => {
        staleMouseDrops += 1;
      },
    },
  );
  const payload = new Uint8Array([1, 2, 3]);
  const newerPayload = new Uint8Array([4, 5, 6]);

  controller.sendInput(payload, INPUT_MOUSE_REL);
  controller.sendInput(newerPayload, INPUT_MOUSE_REL);
  assert.equal(staleMouseDrops, 1);
  assert.equal(channelPackets.length, 0);
  assert.equal(reliablePackets.length, 0);

  controller.sendInput(payload, INPUT_KEY_DOWN);
  assert.deepEqual(reliablePackets, [payload]);

  bufferedAmount = 0;
  bufferedAmountLowListener();
  assert.deepEqual(channelPackets, [newerPayload]);
});

test("critical input can force a reliable flush of pending mouse movement", () => {
  const controller = new DomInputCaptureController({} as never, {
    mouseSensitivity: 1,
    mouseAccelerationPercent: 1,
    nativeCursorOverlay: false,
  });
  let forceReliable: boolean | undefined;
  (
    controller as unknown as {
      flushPendingMouseMovement: (value?: boolean) => void;
    }
  ).flushPendingMouseMovement = (value) => {
    forceReliable = value;
  };

  controller.flushPendingMovement(true);
  assert.equal(forceReliable, true);
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
