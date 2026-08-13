/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";

import {
  MouseDeltaFilter,
  RollingPercentileWindow,
  shouldFlushMouseDirectionCorrection,
} from "./mouseInput";

test("raw mouse mode forwards fast direction corrections without filtering", () => {
  const filter = new MouseDeltaFilter();
  filter.setRelaxedForRawInput(true);

  assert.equal(filter.update(18, 0, 10), true);
  assert.equal(filter.getX(), 18);
  assert.equal(filter.getY(), 0);

  // A fast reverse is a legitimate high-polling-rate correction, not an outlier.
  assert.equal(filter.update(-18, 0, 10.4), true);
  assert.equal(filter.getX(), -18);
  assert.equal(filter.getY(), 0);
});

test("raw mouse correction flush detects clear reversals without over-flushing", () => {
  assert.equal(shouldFlushMouseDirectionCorrection(4, 0, -1, 0), true);
  assert.equal(shouldFlushMouseDirectionCorrection(4, 0, 0, 1), false);
  assert.equal(shouldFlushMouseDirectionCorrection(0.4, 0, -1, 0), false);
});

test("RollingPercentileWindow returns stable p50 and p95 for mouse batch ages", () => {
  const window = new RollingPercentileWindow(8);
  for (const sample of [1, 2, 3, 4, 5, 6, 7, 8]) {
    window.add(sample);
  }

  assert.equal(window.getPercentile(50), 4);
  assert.equal(window.getPercentile(95), 8);
});

test("RollingPercentileWindow overwrites the oldest samples without growing", () => {
  const window = new RollingPercentileWindow(3);
  window.add(1);
  window.add(2);
  window.add(3);
  window.add(10);

  assert.equal(window.getPercentile(50), 3);
  assert.equal(window.getPercentile(95), 10);
});
