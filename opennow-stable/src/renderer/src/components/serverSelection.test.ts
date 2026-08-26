import assert from "node:assert/strict";
import test from "node:test";

import {
  getServerSelectionHint,
  getServerRouteAdvice,
  getServerSelectionScore,
  loadLatestServerSelectionTelemetry,
  loadRouteABMeasurement,
  recordServerRouteHealth,
  recordServerSelection,
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

test("route quality score penalizes degraded EWMA without requiring a single spike", () => {
  const degraded = candidate({
    zoneId: "DEGRADED-EWMA",
    pingMs: 95,
    routeQualityScore: 35,
    routeAdvice: "unknown",
  });
  const healthy = candidate({
    zoneId: "HEALTHY-EWMA",
    pingMs: 110,
    routeQualityScore: 88,
    routeAdvice: "unknown",
  });
  const ranked = sortServerCandidates([degraded, healthy], nowMs);
  assert.equal(ranked[0]?.zoneId, "HEALTHY-EWMA");
  assert.ok(getServerSelectionScore(degraded, nowMs).routePenalty > 0);
  assert.ok(getServerSelectionScore(healthy, nowMs).routePenalty < 0);
});

test("high route quality can mark a route healthy even after legacy counters are absent", () => {
  assert.equal(getServerRouteAdvice({
    zoneId: "QUALITY-GOOD",
    preLaunchPingMs: 100,
    queuePosition: 4,
    selectedAtMs: nowMs - 60_000,
    observedAtMs: nowMs - 1_000,
    routeQualityScore: 92,
    poorSamples: 0,
    goodSamples: 0,
  }, nowMs), "healthy");
});

test("route A/B measurement stores the previous route and computes deltas", () => {
  const originalWindow = globalThis.window;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });

  try {
    recordServerSelection(candidate({ zoneId: "ROUTE-A", pingMs: 100 }));
    recordServerRouteHealth(loadLatestServerSelectionTelemetry(), {
      rttMs: 100,
      jitterMs: 2,
      packetLossPercent: 0,
    }, 1_000);
    recordServerSelection(candidate({ zoneId: "ROUTE-B", pingMs: 150 }));
    recordServerRouteHealth(loadLatestServerSelectionTelemetry(), {
      rttMs: 150,
      jitterMs: 3,
      packetLossPercent: 1,
    }, 4_000);

    const measurement = loadRouteABMeasurement();
    assert.equal(measurement?.routeA.zoneId, "ROUTE-B");
    assert.equal(measurement?.routeB?.zoneId, "ROUTE-A");
    assert.equal(measurement?.deltaRttMs, 50);
    assert.equal(measurement?.deltaJitterMs, 1);
    assert.equal(measurement?.deltaLossPercent, 1);
    assert.equal(measurement?.confidence, "low");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
