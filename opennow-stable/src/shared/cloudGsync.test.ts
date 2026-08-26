import test from "node:test";
import assert from "node:assert/strict";

import { resolveCloudGsync } from "./cloudGsync";

function webResolution(userRequested: boolean, fps: number) {
  return resolveCloudGsync({
    userRequested,
    fps,
    clientMode: "web",
    nativeBackendAvailable: false,
  });
}

test("user off always disables Cloud G-Sync", () => {
  const result = webResolution(false, 240);

  assert.equal(result.enabled, false);
  assert.equal(result.reason, "user-disabled");
});

test("WebRTC mode enables Cloud G-Sync when requested", () => {
  const result = webResolution(true, 60);

  assert.equal(result.enabled, true);
  assert.equal(result.reason, "web-mode");
  assert.equal(result.reflexEnabled, false);
});

test("WebRTC mode keeps the low-latency path enabled below the legacy native FPS threshold", () => {
  const result = webResolution(true, 1);

  assert.equal(result.enabled, true);
  assert.equal(result.reason, "web-mode");
});

test("Reflex remains enabled at the configured 120 FPS threshold", () => {
  const belowThreshold = webResolution(true, 119);
  const atThreshold = webResolution(true, 120);

  assert.equal(belowThreshold.reflexEnabled, false);
  assert.equal(atThreshold.reflexEnabled, true);
});

test("WebRTC mode does not depend on native display capability detection", () => {
  const result = resolveCloudGsync({
    userRequested: true,
    fps: 240,
    clientMode: "web",
    nativeBackendAvailable: false,
    capabilities: {
      platformSupportsCloudGsync: false,
      isVrrCapableDisplay: false,
      isGsyncDisplay: false,
      detectionSource: "unsupported",
    },
    override: "0",
  });

  assert.equal(result.enabled, true);
  assert.equal(result.reason, "web-mode");
});
