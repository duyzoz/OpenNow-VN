import assert from "node:assert/strict";
import test from "node:test";

import type { ActiveSessionInfo } from "@shared/gfn";

import { selectNavbarActiveSession } from "./streamRecoveryDecisions";
import type { RuntimeSnapshot } from "./runtimeSnapshot";

const snapshot: RuntimeSnapshot = {
  version: 1,
  updatedAt: 1,
  streamStatus: "streaming",
  sessionId: "session-1",
  sessionAppId: 101,
  streamingGameId: "game-1",
  streamingStore: "steam",
  recoveryAppId: 101,
  resumeContext: {
    sessionId: "session-1",
    serverIp: "192.0.2.10",
  },
};

const session = (
  overrides: Partial<ActiveSessionInfo> = {},
): ActiveSessionInfo => ({
  sessionId: "session-1",
  appId: 101,
  status: 3,
  serverIp: "192.0.2.10",
  ...overrides,
});

test("navbar recovery prefers the persisted session id among ready server sessions", () => {
  const result = selectNavbarActiveSession([
    session({ sessionId: "other-session", appId: 202, serverIp: "192.0.2.20" }),
    session(),
  ], snapshot);

  assert.equal(result.candidate?.sessionId, "session-1");
  assert.equal(result.hasMatchingQueuedSession, false);
});

test("queued status 1 is kept pending and is never promoted to Continue", () => {
  const result = selectNavbarActiveSession([
    session({ status: 1, serverIp: undefined }),
  ], snapshot);

  assert.equal(result.candidate, null);
  assert.equal(result.hasMatchingQueuedSession, true);
});

test("a successful lookup can retire a snapshot only when no ready or queued match remains", () => {
  const result = selectNavbarActiveSession([
    session({ sessionId: "unrelated", appId: 404, serverIp: "192.0.2.40" }),
  ], snapshot);

  assert.equal(result.candidate?.sessionId, "unrelated");
  assert.equal(result.hasMatchingQueuedSession, false);
});

test("no active sessions returns no candidate and no pending match", () => {
  const result = selectNavbarActiveSession([], snapshot);

  assert.equal(result.candidate, null);
  assert.equal(result.hasMatchingQueuedSession, false);
});
