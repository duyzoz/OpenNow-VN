import assert from "node:assert/strict";
import test from "node:test";

import {
  getServerSelectionHint,
  getServerRouteAdvice,
  getServerSelectionScore,
  sortServerCandidates,
  type ServerSelectionCandidate,
} from "./serverSelection";

const nowMs = Date.UTC(2026, 7, 13, 0, 0, 0);

function candidate(overrides: Partial<ServerSelectionCandidate>): ServerSelectionCandidate {
  return {
    zoneId: "US-TEST",
    region: "US",
    pingMs: 80,
    queuePosition: 5,
    ...overrides,
  };
}

test("server ranking keeps ping primary while penalizing a severely congested zone", () => {
  const ranked = sortServerCandidates([
    candidate({ zoneId: "JP-CROWDED", region: "JP", pingMs: 42, queuePosition: 800, etaMs: 60 * 60 * 1000 }),
    candidate({ zoneId: "US-STABLE", region: "US", pingMs: 92, queuePosition: 8, etaMs: 5 * 60 * 1000 }),
  ], nowMs);

  assert.deepEqual(ranked.map((zone) => zone.zoneId), ["US-STABLE", "JP-CROWDED"]);
});

test("measured routes are listed before unmeasured routes", () => {
  const ranked = sortServerCandidates([
    candidate({ zoneId: "UNMEASURED", pingMs: null, queuePosition: 0 }),
    candidate({ zoneId: "MEASURED", pingMs: 180, queuePosition: 10 }),
  ], nowMs);

  assert.deepEqual(ranked.map((zone) => zone.zoneId), ["MEASURED", "UNMEASURED"]);
});

test("recent selection is only a small tie-break bonus", () => {
  const recent = candidate({
    zoneId: "RECENT-SLOW",
    pingMs: 180,
    queuePosition: 80,
    lastSelectedAtMs: nowMs - 60 * 60 * 1000,
  });
  const stable = candidate({ zoneId: "STABLE-FAST", pingMs: 45, queuePosition: 5 });

  assert.ok(getServerSelectionScore(recent, nowMs).recencyBonus > 0);
  assert.equal(sortServerCandidates([recent, stable], nowMs)[0]?.zoneId, "STABLE-FAST");
});

test("server hint exposes congestion and recent-choice state", () => {
  assert.equal(getServerSelectionHint(candidate({ queuePosition: 140 }), nowMs), "congested");
  assert.equal(
    getServerSelectionHint(candidate({ lastSelectedAtMs: nowMs - 5 * 60 * 1000 }), nowMs),
    "recommended",
  );
});

test("prefer-us changes only the preference weight, not the measured-ping contract", () => {
  const us = candidate({ zoneId: "US-OK", region: "US", pingMs: 80, queuePosition: 10 });
  const ranked = sortServerCandidates([
    candidate({ zoneId: "EU-FAST", region: "EU", pingMs: 40, queuePosition: 10 }),
    us,
  ], nowMs, { strategy: "prefer-us" });

  assert.equal(ranked[0]?.zoneId, "EU-FAST");
  assert.ok(getServerSelectionScore(us, nowMs, { strategy: "prefer-us" }).preferenceBonus > 0);
});

test("a route marked avoid is pushed below a healthy alternative", () => {
  const ranked = sortServerCandidates([
    candidate({ zoneId: "LAST-BAD", pingMs: 70, queuePosition: 5, routeAdvice: "avoid" }),
    candidate({ zoneId: "NEXT-GOOD", pingMs: 95, queuePosition: 5, routeAdvice: "healthy" }),
  ], nowMs);

  assert.equal(ranked[0]?.zoneId, "NEXT-GOOD");
  assert.equal(getServerRouteAdvice({
    zoneId: "LAST-BAD",
    preLaunchPingMs: 70,
    queuePosition: 5,
    selectedAtMs: nowMs - 10 * 60 * 1000,
    observedAtMs: nowMs - 60 * 1000,
    observedRttMs: 340,
    observedJitterMs: 28,
    observedPacketLossPercent: 0,
    poorSamples: 3,
    goodSamples: 0,
  }, nowMs), "avoid");
});
