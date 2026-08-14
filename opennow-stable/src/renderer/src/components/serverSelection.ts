export type ServerSelectionStrategy = "balanced" | "prefer-us" | "lowest-latency" | "shortest-queue";

export interface ServerSelectionPreferences {
  strategy: ServerSelectionStrategy;
}

export interface ServerSelectionCandidate {
  zoneId: string;
  region?: string;
  pingMs: number | null;
  queuePosition: number;
  etaMs?: number;
  lastSelectedAtMs?: number;
  selectionCount?: number;
  routeAdvice?: ServerRouteAdvice;
  routeQualityScore?: number;
}

export interface ServerSelectionScore {
  total: number;
  pingPressure: number;
  queuePressure: number;
  waitPressure: number;
  congestionPenalty: number;
  recencyBonus: number;
  frequencyBonus: number;
  preferenceBonus: number;
  routePenalty: number;
}

export interface ServerSelectionTelemetry {
  zoneId: string;
  region?: string;
  preLaunchPingMs: number | null;
  queuePosition: number;
  etaMs?: number;
  selectedAtMs: number;
  observedRttMs?: number;
  observedJitterMs?: number;
  observedPacketLossPercent?: number;
  observedRttEwmaMs?: number;
  observedJitterEwmaMs?: number;
  observedPacketLossEwmaPercent?: number;
  routeQualityScore?: number;
  observedAtMs?: number;
  poorSamples: number;
  goodSamples: number;
}

export type ServerRouteAdvice = "avoid" | "healthy" | "unknown";

const PING_TARGET_MS = 220;
const QUEUE_COMFORT_LIMIT = 40;
const ETA_COMFORT_LIMIT_MS = 20 * 60 * 1000;
const CONGESTED_QUEUE_POSITION = 100;
const CONGESTED_ETA_MS = 30 * 60 * 1000;
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const ROUTE_ADVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const ROUTE_EWMA_ALPHA = 0.35;
const ROUTE_GOOD_QUALITY_SCORE = 82;
const ROUTE_POOR_QUALITY_SCORE = 42;
const SERVER_SELECTION_HISTORY_KEY = "opennow.server-selection-history.v1";
const SERVER_SELECTION_FREQUENCY_KEY = "opennow.server-selection-frequency.v1";
const SERVER_SELECTION_PREFERENCES_KEY = "opennow.server-selection-preferences.v1";
const SERVER_SELECTION_TELEMETRY_KEY = "opennow.server-selection-telemetry.v1";
const MAX_HISTORY_ENTRIES = 6;

export const DEFAULT_SERVER_SELECTION_PREFERENCES: ServerSelectionPreferences = {
  strategy: "balanced",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeQueuePosition(queuePosition: number): number {
  return Number.isFinite(queuePosition) ? Math.max(0, queuePosition) : Number.POSITIVE_INFINITY;
}

function safePingMs(pingMs: number | null): number | null {
  return pingMs !== null && Number.isFinite(pingMs) && pingMs >= 0 ? pingMs : null;
}

function safeSelectionCount(selectionCount: number | undefined): number {
  return selectionCount !== undefined && Number.isFinite(selectionCount) ? Math.max(0, selectionCount) : 0;
}

function getWeights(strategy: ServerSelectionStrategy): { ping: number; queue: number; wait: number } {
  switch (strategy) {
    case "prefer-us":
      return { ping: 0.52, queue: 0.25, wait: 0.23 };
    case "lowest-latency":
      return { ping: 0.75, queue: 0.15, wait: 0.10 };
    case "shortest-queue":
      return { ping: 0.35, queue: 0.50, wait: 0.15 };
    case "balanced":
    default:
      return { ping: 0.58, queue: 0.27, wait: 0.15 };
  }
}

/**
 * Lower is better. The formula is deterministic and local so opening the
 * selector never adds an AI/network round-trip to game launch.
 */
export function getServerSelectionScore(
  candidate: ServerSelectionCandidate,
  nowMs: number = Date.now(),
  preferences: ServerSelectionPreferences = DEFAULT_SERVER_SELECTION_PREFERENCES,
): ServerSelectionScore {
  const pingMs = safePingMs(candidate.pingMs);
  const queuePosition = safeQueuePosition(candidate.queuePosition);
  const etaMs = candidate.etaMs !== undefined && Number.isFinite(candidate.etaMs)
    ? Math.max(0, candidate.etaMs)
    : 0;
  const weights = getWeights(preferences.strategy);

  const pingPressure = pingMs === null
    ? 1.15
    : clamp(pingMs / PING_TARGET_MS, 0, 1.25);
  const queuePressure = Number.isFinite(queuePosition)
    ? clamp(queuePosition / QUEUE_COMFORT_LIMIT, 0, 1)
    : 1;
  const waitPressure = clamp(etaMs / ETA_COMFORT_LIMIT_MS, 0, 1);
  const congestionPenalty =
    queuePosition >= CONGESTED_QUEUE_POSITION || etaMs >= CONGESTED_ETA_MS ? 0.30 : 0;

  const recencyAgeMs = candidate.lastSelectedAtMs === undefined
    ? RECENCY_WINDOW_MS
    : clamp(nowMs - candidate.lastSelectedAtMs, 0, RECENCY_WINDOW_MS);
  const recencyBonus = candidate.lastSelectedAtMs === undefined
    ? 0
    : 0.04 * (1 - recencyAgeMs / RECENCY_WINDOW_MS);
  const frequencyBonus = Math.min(0.035, safeSelectionCount(candidate.selectionCount) * 0.005);
  const preferenceBonus = preferences.strategy === "prefer-us" && candidate.region === "US" ? 0.08 : 0;
  const qualityScore = candidate.routeQualityScore !== undefined && Number.isFinite(candidate.routeQualityScore)
    ? clamp(candidate.routeQualityScore, 0, 100)
    : null;
  const routeQualityPenalty = qualityScore === null
    ? 0
    : qualityScore <= ROUTE_POOR_QUALITY_SCORE
    ? 0.32
    : qualityScore >= ROUTE_GOOD_QUALITY_SCORE
    ? -0.035
    : 0.10 * (1 - qualityScore / 100);
  const routePenalty = (candidate.routeAdvice === "avoid"
    ? 0.40
    : candidate.routeAdvice === "healthy"
    ? -0.03
    : 0) + routeQualityPenalty;

  return {
    total: pingPressure * weights.ping
      + queuePressure * weights.queue
      + waitPressure * weights.wait
      + congestionPenalty
      + routePenalty
      - recencyBonus
      - frequencyBonus
      - preferenceBonus,
    pingPressure,
    queuePressure,
    waitPressure,
    congestionPenalty,
    recencyBonus,
    frequencyBonus,
    preferenceBonus,
    routePenalty,
  };
}

export function sortServerCandidates<T extends ServerSelectionCandidate>(
  candidates: readonly T[],
  nowMs: number = Date.now(),
  preferences: ServerSelectionPreferences = DEFAULT_SERVER_SELECTION_PREFERENCES,
): T[] {
  const hasMeasuredPing = candidates.some((candidate) => safePingMs(candidate.pingMs) !== null);

  return [...candidates].sort((a, b) => {
    if (hasMeasuredPing) {
      const aMeasured = safePingMs(a.pingMs) !== null;
      const bMeasured = safePingMs(b.pingMs) !== null;
      if (aMeasured !== bMeasured) return aMeasured ? -1 : 1;
    }

    const scoreA = getServerSelectionScore(a, nowMs, preferences);
    const scoreB = getServerSelectionScore(b, nowMs, preferences);
    const scoreDelta = scoreA.total - scoreB.total;
    if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;

    const pingA = safePingMs(a.pingMs) ?? Number.POSITIVE_INFINITY;
    const pingB = safePingMs(b.pingMs) ?? Number.POSITIVE_INFINITY;
    if (pingA !== pingB) return pingA - pingB;

    const queueA = safeQueuePosition(a.queuePosition);
    const queueB = safeQueuePosition(b.queuePosition);
    if (queueA !== queueB) return queueA - queueB;

    const recentA = a.lastSelectedAtMs ?? 0;
    const recentB = b.lastSelectedAtMs ?? 0;
    if (recentA !== recentB) return recentB - recentA;

    return a.zoneId.localeCompare(b.zoneId);
  });
}

export type ServerSelectionHistory = Readonly<Record<string, number>>;
export type ServerSelectionFrequency = Readonly<Record<string, number>>;

function loadNumberRecord(storageKey: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) record[key] = value;
    }
    return record;
  } catch {
    return {};
  }
}

export function loadServerSelectionHistory(): ServerSelectionHistory {
  const nowMs = Date.now();
  return Object.fromEntries(
    Object.entries(loadNumberRecord(SERVER_SELECTION_HISTORY_KEY))
      .filter(([, selectedAtMs]) => nowMs - selectedAtMs <= RECENCY_WINDOW_MS)
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_HISTORY_ENTRIES),
  );
}

export function loadServerSelectionFrequency(): ServerSelectionFrequency {
  return loadNumberRecord(SERVER_SELECTION_FREQUENCY_KEY);
}

export function rememberServerSelection(zoneId: string, selectedAtMs: number = Date.now()): void {
  if (typeof window === "undefined" || !zoneId) return;

  try {
    const history = {
      ...loadServerSelectionHistory(),
      [zoneId]: selectedAtMs,
    };
    const historyEntries = Object.entries(history)
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_HISTORY_ENTRIES);
    window.localStorage.setItem(SERVER_SELECTION_HISTORY_KEY, JSON.stringify(Object.fromEntries(historyEntries)));

    const frequency = loadNumberRecord(SERVER_SELECTION_FREQUENCY_KEY);
    frequency[zoneId] = Math.min(99, (frequency[zoneId] ?? 0) + 1);
    window.localStorage.setItem(SERVER_SELECTION_FREQUENCY_KEY, JSON.stringify(frequency));
  } catch {
    // Storage is optional; server selection must continue if it is unavailable.
  }
}

export function loadServerSelectionPreferences(): ServerSelectionPreferences {
  if (typeof window === "undefined") return DEFAULT_SERVER_SELECTION_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(SERVER_SELECTION_PREFERENCES_KEY);
    if (!raw) return DEFAULT_SERVER_SELECTION_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<ServerSelectionPreferences>;
    const strategy = parsed.strategy;
    if (strategy === "balanced" || strategy === "prefer-us" || strategy === "lowest-latency" || strategy === "shortest-queue") {
      return { strategy };
    }
  } catch {
    // Use the safe default below.
  }
  return DEFAULT_SERVER_SELECTION_PREFERENCES;
}

export function saveServerSelectionPreferences(preferences: ServerSelectionPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SERVER_SELECTION_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are optional.
  }
}

export function getServerSelectionHint(
  candidate: ServerSelectionCandidate,
  nowMs: number = Date.now(),
  preferences: ServerSelectionPreferences = DEFAULT_SERVER_SELECTION_PREFERENCES,
): "recommended" | "frequent" | "congested" | "measured" | "unmeasured" {
  const score = getServerSelectionScore(candidate, nowMs, preferences);
  if (score.congestionPenalty > 0) return "congested";
  if (safeSelectionCount(candidate.selectionCount) >= 3) return "frequent";
  if (candidate.lastSelectedAtMs !== undefined && score.recencyBonus > 0) return "recommended";
  if (candidate.pingMs !== null && Number.isFinite(candidate.pingMs)) return "measured";
  return "unmeasured";
}

export function loadLatestServerSelectionTelemetry(): ServerSelectionTelemetry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SERVER_SELECTION_TELEMETRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ServerSelectionTelemetry>;
    if (typeof parsed.zoneId !== "string" || typeof parsed.queuePosition !== "number" || typeof parsed.selectedAtMs !== "number") {
      return null;
    }
    return {
      zoneId: parsed.zoneId,
      region: typeof parsed.region === "string" ? parsed.region : undefined,
      preLaunchPingMs: typeof parsed.preLaunchPingMs === "number" ? parsed.preLaunchPingMs : null,
      queuePosition: parsed.queuePosition,
      etaMs: typeof parsed.etaMs === "number" ? parsed.etaMs : undefined,
      selectedAtMs: parsed.selectedAtMs,
      observedRttMs: typeof parsed.observedRttMs === "number" ? parsed.observedRttMs : undefined,
      observedJitterMs: typeof parsed.observedJitterMs === "number" ? parsed.observedJitterMs : undefined,
      observedPacketLossPercent: typeof parsed.observedPacketLossPercent === "number" ? parsed.observedPacketLossPercent : undefined,
      observedRttEwmaMs: typeof parsed.observedRttEwmaMs === "number" ? parsed.observedRttEwmaMs : undefined,
      observedJitterEwmaMs: typeof parsed.observedJitterEwmaMs === "number" ? parsed.observedJitterEwmaMs : undefined,
      observedPacketLossEwmaPercent: typeof parsed.observedPacketLossEwmaPercent === "number" ? parsed.observedPacketLossEwmaPercent : undefined,
      routeQualityScore: typeof parsed.routeQualityScore === "number" ? parsed.routeQualityScore : undefined,
      observedAtMs: typeof parsed.observedAtMs === "number" ? parsed.observedAtMs : undefined,
      poorSamples: typeof parsed.poorSamples === "number" ? parsed.poorSamples : 0,
      goodSamples: typeof parsed.goodSamples === "number" ? parsed.goodSamples : 0,
    };
  } catch {
    return null;
  }
}

export function recordServerSelection(candidate: ServerSelectionCandidate): void {
  if (typeof window === "undefined" || !candidate.zoneId) return;
  try {
    const previous = loadLatestServerSelectionTelemetry();
    const telemetry: ServerSelectionTelemetry = {
      zoneId: candidate.zoneId,
      region: candidate.region,
      preLaunchPingMs: safePingMs(candidate.pingMs),
      queuePosition: Math.max(0, candidate.queuePosition),
      etaMs: candidate.etaMs,
      selectedAtMs: Date.now(),
      observedRttMs: previous?.zoneId === candidate.zoneId ? previous.observedRttMs : undefined,
      observedJitterMs: previous?.zoneId === candidate.zoneId ? previous.observedJitterMs : undefined,
      observedPacketLossPercent: previous?.zoneId === candidate.zoneId ? previous.observedPacketLossPercent : undefined,
      observedRttEwmaMs: previous?.zoneId === candidate.zoneId ? previous.observedRttEwmaMs : undefined,
      observedJitterEwmaMs: previous?.zoneId === candidate.zoneId ? previous.observedJitterEwmaMs : undefined,
      observedPacketLossEwmaPercent: previous?.zoneId === candidate.zoneId ? previous.observedPacketLossEwmaPercent : undefined,
      routeQualityScore: previous?.zoneId === candidate.zoneId ? previous.routeQualityScore : undefined,
      observedAtMs: undefined,
      poorSamples: previous?.zoneId === candidate.zoneId ? previous.poorSamples : 0,
      goodSamples: previous?.zoneId === candidate.zoneId ? previous.goodSamples : 0,
    };
    window.localStorage.setItem(SERVER_SELECTION_TELEMETRY_KEY, JSON.stringify(telemetry));
  } catch {
    // Route telemetry must never block launch.
  }
}

export function recordServerRouteHealth(
  route: ServerSelectionTelemetry | null,
  health: { rttMs: number; jitterMs: number; packetLossPercent: number },
  nowMs: number = Date.now(),
): void {
  if (typeof window === "undefined" || !route || !Number.isFinite(health.rttMs)) return;
  try {
    const latest = loadLatestServerSelectionTelemetry();
    const current = latest?.zoneId === route.zoneId ? latest : route;
    if (current.observedAtMs !== undefined && nowMs - current.observedAtMs < 2000) return;
    const previousRtt = current.observedRttEwmaMs ?? current.observedRttMs ?? health.rttMs;
    const previousJitter = current.observedJitterEwmaMs ?? current.observedJitterMs ?? health.jitterMs;
    const previousLoss = current.observedPacketLossEwmaPercent ?? current.observedPacketLossPercent ?? health.packetLossPercent;
    const rttEwma = previousRtt + ROUTE_EWMA_ALPHA * (health.rttMs - previousRtt);
    const jitterEwma = previousJitter + ROUTE_EWMA_ALPHA * (health.jitterMs - previousJitter);
    const lossEwma = previousLoss + ROUTE_EWMA_ALPHA * (health.packetLossPercent - previousLoss);
    const routeQualityScore = clamp(
      100
        - Math.max(0, rttEwma - 120) * 0.18
        - jitterEwma * 1.8
        - lossEwma * 14,
      0,
      100,
    );
    const poor = routeQualityScore <= ROUTE_POOR_QUALITY_SCORE;
    const next: ServerSelectionTelemetry = {
      ...current,
      observedRttMs: health.rttMs,
      observedJitterMs: health.jitterMs,
      observedPacketLossPercent: health.packetLossPercent,
      observedRttEwmaMs: rttEwma,
      observedJitterEwmaMs: jitterEwma,
      observedPacketLossEwmaPercent: lossEwma,
      routeQualityScore,
      observedAtMs: nowMs,
      poorSamples: poor ? current.poorSamples + 1 : Math.max(0, current.poorSamples - 1),
      goodSamples: poor ? Math.max(0, current.goodSamples - 1) : current.goodSamples + 1,
    };
    window.localStorage.setItem(SERVER_SELECTION_TELEMETRY_KEY, JSON.stringify(next));
  } catch {
    // Route telemetry must never block the stream.
  }
}

export function getServerRouteAdvice(route: ServerSelectionTelemetry | null, nowMs: number = Date.now()): ServerRouteAdvice {
  if (!route || !route.observedAtMs || nowMs - route.observedAtMs > ROUTE_ADVICE_WINDOW_MS) return "unknown";
  const qualityScore = route.routeQualityScore;
  if (route.poorSamples >= 3 || (qualityScore !== undefined && qualityScore <= ROUTE_POOR_QUALITY_SCORE)) return "avoid";
  if (route.goodSamples >= 3 || (qualityScore !== undefined && qualityScore >= ROUTE_GOOD_QUALITY_SCORE)) return "healthy";
  return "unknown";
}

export const SERVER_SELECTION_CONSTANTS = {
  PING_TARGET_MS,
  QUEUE_COMFORT_LIMIT,
  ETA_COMFORT_LIMIT_MS,
  CONGESTED_QUEUE_POSITION,
  CONGESTED_ETA_MS,
  ROUTE_ADVICE_WINDOW_MS,
  ROUTE_EWMA_ALPHA,
  ROUTE_GOOD_QUALITY_SCORE,
  ROUTE_POOR_QUALITY_SCORE,
} as const;
