/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";

import * as sdp from "./sdp";

test("sdp barrel preserves the public API", () => {
  assert.deepEqual(Object.keys(sdp).sort(), [
    "buildNvstSdp",
    "extractIceCredentials",
    "extractIceUfragFromOffer",
    "extractPublicIp",
    "fixServerIp",
    "mungeAnswerSdp",
    "preferCodec",
    "rewriteH265LevelIdByProfile",
    "rewriteH265TierFlag",
    "rewriteIceCandidateEndpoint",
    "rewriteSdpIceCandidateEndpoints",
  ]);
});

test("buildNvstSdp creates server negotiation metadata alongside WebRTC answer", () => {
  const metadata = sdp.buildNvstSdp({
    width: 1920,
    height: 1080,
    fps: 60,
    maxBitrateKbps: 25_000,
    partialReliableThresholdMs: 100,
    hidDeviceMask: 0xff,
    enablePartiallyReliableTransferGamepad: 0xff,
    enablePartiallyReliableTransferHid: 0xff,
    codec: "H264",
    colorQuality: "8bit_420",
    credentials: {
      ufrag: "test-ufrag",
      pwd: "test-password",
      fingerprint: "AA:BB:CC",
    },
  });

  assert.match(metadata, /^v=0\r?\n/);
  assert.match(metadata, /a=general\.icePassword:test-password/);
  assert.match(metadata, /a=general\.iceUserNameFragment:test-ufrag/);
  assert.match(metadata, /a=video\.clientViewportWd:1920/);
  assert.match(metadata, /a=video\.clientViewportHt:1080/);
  assert.match(metadata, /a=ri\.partialReliableThresholdMs:100/);
});
