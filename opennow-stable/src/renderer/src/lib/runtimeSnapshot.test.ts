import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeRuntimeSnapshotContext,
  shouldPreserveLoadedRuntimeSnapshot,
  type RuntimeSnapshot,
} from "./runtimeSnapshot";

const snapshot: RuntimeSnapshot = {
  version: 1,
  updatedAt: 1,
  streamStatus: "connecting",
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

test("startup persistence keeps a loaded snapshot before auth hydrates the active session", () => {
  assert.equal(
    shouldPreserveLoadedRuntimeSnapshot(snapshot, "idle", false, false),
    true,
  );
});

test("startup persistence does not preserve a snapshot after live session hydration", () => {
  assert.equal(
    shouldPreserveLoadedRuntimeSnapshot(snapshot, "idle", true, false),
    false,
  );
  assert.equal(
    shouldPreserveLoadedRuntimeSnapshot(snapshot, "idle", false, true),
    false,
  );
});

test("intentional reset with no loaded snapshot is never resurrected", () => {
  assert.equal(
    shouldPreserveLoadedRuntimeSnapshot(null, "idle", false, false),
    false,
  );
});

test("matching server session keeps the last known game presentation context", () => {
  const refreshedSnapshot: RuntimeSnapshot = {
    ...snapshot,
    streamingGameId: null,
    streamingStore: null,
    recoveryAppId: null,
    resumeContext: {
      sessionId: "session-1",
      serverIp: "192.0.2.10",
    },
  };

  const merged = mergeRuntimeSnapshotContext(refreshedSnapshot, snapshot);
  assert.equal(merged?.streamingGameId, "game-1");
  assert.equal(merged?.streamingStore, "steam");
  assert.equal(merged?.recoveryAppId, 101);
});

test("a different session never inherits stale game presentation context", () => {
  const refreshedSnapshot: RuntimeSnapshot = {
    ...snapshot,
    sessionId: "session-2",
    streamingGameId: null,
    streamingStore: null,
    recoveryAppId: null,
    resumeContext: {
      sessionId: "session-2",
      serverIp: "192.0.2.20",
    },
  };

  const merged = mergeRuntimeSnapshotContext(refreshedSnapshot, snapshot);
  assert.equal(merged?.streamingGameId, null);
  assert.equal(merged?.streamingStore, null);
  assert.equal(merged?.recoveryAppId, null);
});
