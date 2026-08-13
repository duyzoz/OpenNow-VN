import test from "node:test";
import assert from "node:assert/strict";

import type { SessionInfo } from "@shared/gfn";

import { mergePolledSessionState } from "./queueAds";

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    sessionId: "session-1",
    status: 1,
    queuePosition: 1,
    zone: "US-West",
    serverIp: "203.0.113.10",
    signalingServer: "203.0.113.10:443",
    signalingUrl: "wss://203.0.113.10/nvst/",
    iceServers: [{ urls: ["stun:stun.example.test:3478"] }],
    mediaConnectionInfo: { ip: "203.0.113.20", port: 49000, usage: 2 },
    ...overrides,
  };
}

test("mergePolledSessionState preserves connection endpoints when ready poll is sparse", () => {
  const previous = makeSession();
  const readyPoll = makeSession({
    status: 2,
    queuePosition: undefined,
    serverIp: "",
    signalingServer: "",
    signalingUrl: "",
    iceServers: [],
    mediaConnectionInfo: undefined,
  });

  const merged = mergePolledSessionState(previous, readyPoll);

  assert.equal(merged.status, 2);
  assert.equal(merged.serverIp, previous.serverIp);
  assert.equal(merged.signalingServer, previous.signalingServer);
  assert.equal(merged.signalingUrl, previous.signalingUrl);
  assert.deepEqual(merged.iceServers, previous.iceServers);
  assert.deepEqual(merged.mediaConnectionInfo, previous.mediaConnectionInfo);
});

test("mergePolledSessionState prefers fresh ready endpoints when present", () => {
  const previous = makeSession();
  const readyPoll = makeSession({
    status: 2,
    serverIp: "198.51.100.10",
    signalingServer: "198.51.100.10:443",
    signalingUrl: "wss://198.51.100.10/nvst/",
    iceServers: [{ urls: ["stun:fresh.example.test:3478"] }],
    mediaConnectionInfo: { ip: "198.51.100.20", port: 49100, usage: 2 },
  });

  const merged = mergePolledSessionState(previous, readyPoll);

  assert.equal(merged.serverIp, readyPoll.serverIp);
  assert.equal(merged.signalingServer, readyPoll.signalingServer);
  assert.equal(merged.signalingUrl, readyPoll.signalingUrl);
  assert.deepEqual(merged.iceServers, readyPoll.iceServers);
  assert.deepEqual(merged.mediaConnectionInfo, readyPoll.mediaConnectionInfo);
});
