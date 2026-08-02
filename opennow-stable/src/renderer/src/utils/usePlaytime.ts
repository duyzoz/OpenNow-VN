import { useCallback, useEffect, useRef, useState } from "react";
import { invalidatePlaytimeCache } from "../lib/playtimeStats";

const STORAGE_KEY = "opennow:playtime";
/** In-progress sessions, so a crash or a hard app close never loses played time. */
const ACTIVE_KEY = "opennow:playtime:active";
/** How often running time is flushed to disk. Also drives the live UI counter. */
const TICK_MS = 1000;

export interface PlaytimeRecord {
  totalSeconds: number;
  lastPlayedAt: string | null;
  sessionCount: number;
}

export type PlaytimeStore = Record<string, PlaytimeRecord>;

/** gameId -> epoch ms of the last time this session was flushed. */
type ActiveSessions = Record<string, number>;

function loadStore(): PlaytimeStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as PlaytimeStore;
    }
  } catch {
  }
  return {};
}

function saveStore(store: PlaytimeStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
  }
  // The `storage` event never fires in the window that performed the write, so
  // the read-only cache in playtimeStats would keep serving stale totals to the
  // game detail panel. Invalidate it explicitly on every write.
  invalidatePlaytimeCache();
}

function loadActive(): ActiveSessions {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as ActiveSessions;
    }
  } catch {
  }
  return {};
}

function saveActive(active: ActiveSessions): void {
  try {
    if (Object.keys(active).length === 0) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
  } catch {
  }
}

function emptyRecord(): PlaytimeRecord {
  return { totalSeconds: 0, lastPlayedAt: null, sessionCount: 0 };
}

function addSeconds(store: PlaytimeStore, gameId: string, seconds: number): PlaytimeStore {
  if (seconds <= 0) return store;
  const existing = store[gameId] ?? emptyRecord();
  return {
    ...store,
    [gameId]: {
      ...existing,
      totalSeconds: existing.totalSeconds + seconds,
      lastPlayedAt: new Date().toISOString(),
    },
  };
}

/**
 * Folds any session that was still running when the app was last closed back
 * into the totals. Without this, quitting mid-game silently discarded the whole
 * session.
 */
function reconcileOrphanedSessions(): PlaytimeStore {
  const active = loadActive();
  const ids = Object.keys(active);
  let store = loadStore();
  if (ids.length === 0) return store;

  const now = Date.now();
  for (const gameId of ids) {
    const since = Number(active[gameId]);
    if (!Number.isFinite(since) || since <= 0 || since > now) continue;
    const elapsed = Math.floor((now - since) / 1000);
    // Guard against a stale marker from a machine that slept for days.
    if (elapsed > 0 && elapsed < 24 * 3600) store = addSeconds(store, gameId, elapsed);
  }

  saveActive({});
  saveStore(store);
  return store;
}

export function formatPlaytime(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return totalSeconds <= 0 ? "Never played" : "< 1 min";
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m} m`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} m`;
}

export function formatRemainingPlaytimeFromSubscription(
  subscription: { isUnlimited: boolean; remainingHours: number } | null,
  consumedHours = 0,
): string {
  if (!subscription) {
    return "--";
  }
  if (subscription.isUnlimited) {
    return "Unlimited";
  }

  const baseHours = Number.isFinite(subscription.remainingHours) ? subscription.remainingHours : 0;
  const safeHours = Math.max(0, baseHours - Math.max(0, consumedHours));
  const totalMinutes = Math.round(safeHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m`;
}

export interface UsePlaytimeReturn {
  playtime: PlaytimeStore;
  startSession: (gameId: string) => void;
  endSession: (gameId: string) => void;
}

export function usePlaytime(): UsePlaytimeReturn {
  const [playtime, setPlaytime] = useState<PlaytimeStore>(reconcileOrphanedSessions);
  const activeRef = useRef<ActiveSessions>({});

  /** Move elapsed wall-clock time of every running session into the totals. */
  const flush = useCallback((): void => {
    const ids = Object.keys(activeRef.current);
    if (ids.length === 0) return;

    const now = Date.now();
    let changed = false;

    setPlaytime((prev) => {
      let next = prev;
      for (const gameId of ids) {
        const since = activeRef.current[gameId];
        const elapsed = Math.floor((now - since) / 1000);
        if (elapsed <= 0) continue;
        next = addSeconds(next, gameId, elapsed);
        // Keep the remainder sub-second so nothing is rounded away over time.
        activeRef.current[gameId] = since + elapsed * 1000;
        changed = true;
      }
      if (!changed) return prev;
      saveStore(next);
      saveActive(activeRef.current);
      return next;
    });
  }, []);

  // Live ticker: totals visibly count up second by second during a session and
  // are persisted continuously, so killing the app loses at most one second.
  useEffect(() => {
    const id = window.setInterval(flush, TICK_MS);
    const onUnload = (): void => flush();
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      flush();
    };
  }, [flush]);

  const startSession = useCallback((gameId: string): void => {
    activeRef.current = { ...activeRef.current, [gameId]: Date.now() };
    saveActive(activeRef.current);

    setPlaytime((prev) => {
      const existing = prev[gameId] ?? emptyRecord();
      const next: PlaytimeStore = {
        ...prev,
        [gameId]: {
          ...existing,
          lastPlayedAt: new Date().toISOString(),
          sessionCount: existing.sessionCount + 1,
        },
      };
      saveStore(next);
      return next;
    });
  }, []);

  const endSession = useCallback((gameId: string): void => {
    const since = activeRef.current[gameId];
    if (since == null) return;

    const elapsed = Math.max(0, Math.floor((Date.now() - since) / 1000));
    const remaining = { ...activeRef.current };
    delete remaining[gameId];
    activeRef.current = remaining;
    saveActive(remaining);

    if (elapsed === 0) return;

    setPlaytime((prev) => {
      const next = addSeconds(prev, gameId, elapsed);
      saveStore(next);
      return next;
    });
  }, []);

  return { playtime, startSession, endSession };
}
