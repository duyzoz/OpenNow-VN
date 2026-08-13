/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";

import { RollingPercentileWindow } from "./mouseInput";

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
