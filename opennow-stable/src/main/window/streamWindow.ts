import { BrowserWindow, nativeImage, net } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { lookupGameImageUrl, lookupGameTitle } from "../gameTitleCache";
import type { StreamWindowOpenRequest, StreamWindowOpenResult } from "@shared/gfn";

// NOTE (v9, additive-only module): this file is brand new. It is never
// imported by any existing v8 code path unless the renderer explicitly asks
// to open a stream window, so it cannot change how the main window (or any
// existing feature) behaves.

export interface CreateStreamWindowDeps {
  mainDir: string;
  getStreamWindow(): BrowserWindow | null;
  setStreamWindow(window: BrowserWindow | null): void;
  notifyStreamWindowClosed(): void;
}

/**
 * Best-effort: fetch the game's catalog artwork and apply it as the window /
 * taskbar icon so the secondary cloud window looks like a native per-game
 * app window. Every failure path is swallowed — a missing or broken icon
 * must never take down the stream window.
 */
async function applyDynamicIcon(window: BrowserWindow, gameId: string): Promise<void> {
  try {
    const imageUrl = lookupGameImageUrl(gameId);
    if (!imageUrl) return;
    const response = await net.fetch(imageUrl);
    if (!response.ok) return;
    const arrayBuffer = await response.arrayBuffer();
    const image = nativeImage.createFromBuffer(Buffer.from(arrayBuffer));
    if (!image.isEmpty() && !window.isDestroyed()) {
      window.setIcon(image);
    }
  } catch (error) {
    console.warn("[StreamWindow] Failed to load dynamic game icon (non-fatal):", error);
  }
}

/**
 * Opens the dedicated secondary "cloud client" window used to run a single
 * cloud stream session, or focuses it if one is already open. Reuses the
 * exact same renderer bundle as the main window (query-string routed via
 * `windowRole=stream`) so there is no second Vite entry point to keep in
 * sync.
 *
 * The window is requested fullscreen immediately (before the stream session
 * even connects) so the user drops straight into the cloud game full-screen
 * instead of a small windowed "waiting room".
 */
export async function openOrFocusStreamWindow(
  deps: CreateStreamWindowDeps,
  request: StreamWindowOpenRequest,
): Promise<StreamWindowOpenResult> {
  const existing = deps.getStreamWindow();
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    if (!existing.isFullScreen()) existing.setFullScreen(true);
    existing.show();
    existing.focus();
    return { opened: false, focused: true };
  }

  const preloadMjsPath = join(deps.mainDir, "../preload/index.mjs");
  const preloadJsPath = join(deps.mainDir, "../preload/index.js");
  const preloadPath = existsSync(preloadMjsPath) ? preloadMjsPath : preloadJsPath;

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: "#050608",
    // Go straight to fullscreen: the user must land directly in the cloud
    // game, never in a small windowed "queue" view.
    fullscreen: true,
    // PERF: avoid a white flash and let the renderer paint the first real
    // frame before showing anything.
    show: false,
    title: lookupGameTitle(request.gameId) ?? "OpenNOW Cloud",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  window.once("ready-to-show", () => {
    if (window.isDestroyed()) return;
    if (!window.isFullScreen()) window.setFullScreen(true);
    window.show();
    window.focus();
  });

  deps.setStreamWindow(window);

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("[StreamWindow] Renderer process gone:", details);
  });
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level < 2) return;
    console.error(`[stream-window:console:${level}]`, message, sourceId ? `(${sourceId}:${line})` : "");
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  window.on("closed", () => {
    deps.setStreamWindow(null);
    deps.notifyStreamWindowClosed();
  });

  const query = new URLSearchParams({
    windowRole: "stream",
    gameId: request.gameId,
  });
  if (request.resume) query.set("resume", "1");
  if (request.variantId) query.set("variantId", request.variantId);
  if (request.streamingBaseUrl) query.set("streamingBaseUrl", request.streamingBaseUrl);
  const queryString = query.toString();

  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${queryString}`);
  } else {
    await window.loadFile(join(deps.mainDir, "../../dist/index.html"), {
      search: queryString,
    });
  }

  void applyDynamicIcon(window, request.gameId);

  return { opened: true, focused: false };
}
