import assert from "node:assert/strict";
import test from "node:test";
import type { PrintedWasteServerMapping } from "@shared/gfn";
import {
  buildServerDisplayLabel,
  decodeServerText,
  sanitizeReadableServerLabel,
} from "./serverDisplayLabel";

test("decodes ordinary percent-encoded server titles", () => {
  assert.equal(decodeServerText("Northern%20California"), "Northern California");
  assert.equal(sanitizeReadableServerLabel("Northern%20California"), "Northern California");
});

test("rejects encoded technical location strings from presentation", () => {
  assert.equal(sanitizeReadableServerLabel("US%20West%20(PN-PDX-01)"), null);
  assert.equal(sanitizeReadableServerLabel("https://prod.nvidia.com"), null);
  assert.equal(sanitizeReadableServerLabel("NP-SJC6-04"), null);
});

test("builds a concrete local label from PrintedWaste metadata", () => {
  const mapping: PrintedWasteServerMapping = {
    "NP-PDX-01": { title: "Oregon", region: "US Northwest" },
    "NP-SJC6-04": { title: "Northern%20California", region: "US West" },
  };

  assert.equal(
    buildServerDisplayLabel("NP-PDX-01", "US", mapping, "North America"),
    "Oregon · US Northwest",
  );
  assert.equal(
    buildServerDisplayLabel("NP-SJC6-04", "US", mapping, "North America"),
    "Northern California · US West",
  );
});

test("falls back to a readable region when a mapping entry is opaque", () => {
  const mapping: PrintedWasteServerMapping = {
    "NP-TEST-01": { title: "NP-TEST-01", region: "US%20West%20(PN-PDX-01)" },
  };
  assert.equal(
    buildServerDisplayLabel("NP-TEST-01", "US", mapping, "North America"),
    "North America",
  );
});
