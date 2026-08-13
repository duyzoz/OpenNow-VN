import assert from "node:assert/strict";
import test from "node:test";

import { defaultDiagnostics } from "./streamDiagnostics";

test("starts with WebRTC Ultra live-stream diagnostics defaults", () => {
  const diagnostics = defaultDiagnostics();

  assert.equal(diagnostics.connectionState, "closed");
  assert.equal(diagnostics.inputReady, false);
  assert.equal(diagnostics.packetLossPercent, 0);
  assert.equal(diagnostics.inputQueueBufferedBytes, 0);
  assert.equal(diagnostics.partiallyReliableInputQueueBufferedBytes, 0);
  assert.equal(diagnostics.mouseBatchAgeMs, 0);
});
