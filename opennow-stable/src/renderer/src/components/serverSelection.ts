export interface ServerSelectionCandidate {
  zoneId: string;
  region?: string;
  pingMs: number | null;
  queuePosition: number;
  etaMs?: number;
  lastSelectedAtMs?: number;
}

export interface ServerSelectionScore {
  total: number;
  pingPressure: number;
  queuePressure: number;
  waitPressure: number;
  congestionPenalty: number;
  recencyBonus: number;
}

const PING_TARGET_MS = 220;
const QUEUE_COMFORT_LIMIT = 40;
const ETA_COMFORT_LIMIT_MS = 20 * 60 * 1000;
const CONGESTED_QUEUE_POSITION = 100;
const CONGESTED_ETA_MS = 30 * 60 * 1000;
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeQueuePosition(queuePosition: number): number {
  return Number.isFinite(queuePosition) ? Math.max(0, queuePosition) : Number.POSITIVE_INFINITY;
}

function safePingMs(pingMs: number | null): number | null {
  return pingMs !== null && Number.isFinite(pingMs) && pingMs >= 0 ? pingMs : null;
}

/**
 * Lower is better. The formula is deliberately deterministic and local so the
 * selector never adds an AI/network round-trip to game launch.
 *
 * Ping remains the primary signal. Queue position and ETA prevent a very busy
 * region (notably a crowded JP zone) from winning only because its raw ping is
 * lower. Recent choices are a small tie-break bonus and can never override a
 * materially better live route.
 */
export function getServerSelectionScore(
  candidate: ServerSelectionCandidate,
  nowMs: number = Date.now(),
): ServerSelectionScore {
  const pingMs = safePingMs(candidate.pingMs);
  const queuePosition = safeQueuePosition(candidate.queuePosition);
  const etaMs = candidate.etaMs !== undefined && Number.isFinite(candidate.etaMs)
    ? Math.max(0, candidate.etaMs)
    : 0;

  // An unmeasured/failed ping remains below every measured route unless all
  // routes are unmeasured. Queue data still gives those routes a stable order.
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

  return {
    total: pingPressure * 0.58
      + queuePressure * 0.27
      + waitPressure * 0.15
      + congestionPenalty
      - recencyBonus,
    pingPressure,
    queuePressure,
    waitPressure,
    congestionPenalty,
    recencyBonus,
  };
}

export function sortServerCandidates<T extends ServerSelectionCandidate>(
  candidates: readonly T[],
  nowMs: number = Date.now(),
): T[] {
  const hasMeasuredPing = candidates.some((candidate) => safePingMs(candidate.pingMs) !== null);

  return [...candidates].sort((a, b) => {
    if (hasMeasuredPing) {
      const aMeasured = safePingMs(a.pingMs) !== null;
      const bMeasured = safePingMs(b.pingMs) !== null;
      if (aMeasured !== bMeasured) return aMeasured ? -1 : 1;
    }

    const scoreA = getServerSelectionScore(a, nowMs);
    const scoreB = getServerSelectionScore(b, nowMs);
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

const SERVER_SELECTION_HISTORY_KEY = "opennow.server-selection-history.v1";
const MAX_HISTORY_ENTRIES = 6;

export type ServerSelectionHistory = Readonly<Record<string, number>>;

export function loadServerSelectionHistory(): ServerSelectionHistory {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(SERVER_SELECTION_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const nowMs = Date.now();
    const entries: Array<[string, number]> = [];
    for (const [zoneId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && nowMs - value <= RECENCY_WINDOW_MS) {
        entries.push([zoneId, value]);
      }
    }
    entries.sort(([, a], [, b]) => b - a);

    return Object.fromEntries(entries.slice(0, MAX_HISTORY_ENTRIES));
  } catch {
    return {};
  }
}

export function rememberServerSelection(zoneId: string, selectedAtMs: number = Date.now()): void {
  if (typeof window === "undefined" || !zoneId) return;

  try {
    const next = {
      ...loadServerSelectionHistory(),
      [zoneId]: selectedAtMs,
    };
    const entries = Object.entries(next)
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_HISTORY_ENTRIES);
    window.localStorage.setItem(SERVER_SELECTION_HISTORY_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage is optional; server selection must continue if it is unavailable.
  }
}

export function getServerSelectionHint(candidate: ServerSelectionCandidate, nowMs: number = Date.now()): "recommended" | "congested" | "measured" | "unmeasured" {
  const score = getServerSelectionScore(candidate, nowMs);
  if (score.congestionPenalty > 0) return "congested";
  if (candidate.lastSelectedAtMs !== undefined && score.recencyBonus > 0) return "recommended";
  if (candidate.pingMs !== null && Number.isFinite(candidate.pingMs)) return "measured";
  return "unmeasured";
}

export const SERVER_SELECTION_CONSTANTS = {
  PING_TARGET_MS,
  QUEUE_COMFORT_LIMIT,
  ETA_COMFORT_LIMIT_MS,
  CONGESTED_QUEUE_POSITION,
  CONGESTED_ETA_MS,
} as const;
