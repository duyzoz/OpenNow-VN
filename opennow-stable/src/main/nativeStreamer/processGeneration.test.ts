import assert from "node:assert/strict";
import test from "node:test";

import { isCurrentNativeStreamerProcess } from "./processGeneration";

test("accepts a callback only for the current native process generation", () => {
  const process = { id: "current" };

  assert.equal(isCurrentNativeStreamerProcess(process, 4, process, 4), true);
});

test("rejects a late callback from a replaced native process", () => {
  const previousProcess = { id: "previous" };
  const currentProcess = { id: "current" };

  assert.equal(
    isCurrentNativeStreamerProcess(currentProcess, 8, previousProcess, 7),
    false,
  );
});

test("rejects a callback from an invalidated generation of the same process", () => {
  const process = { id: "terminated" };

  assert.equal(isCurrentNativeStreamerProcess(null, 9, process, 8), false);
});
