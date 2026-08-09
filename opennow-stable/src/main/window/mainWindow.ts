import { BrowserWindow, ipcMain, app } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { IPC_CHANNELS } from "@shared/ipc";
import type { DirectLaunchRequest } from "@shared/gfn";
import type { SettingsManager } from "../settings";
import {
  ESCAPE_HOLD_TO_EXIT_FULLSCREEN_MS,
  markEscapeHoldFired,
  nextPointerLockEscapeCaptureUntilMs,
  resolveEscapeHoldCaptureAction,
  type EscapeHoldCaptureState,
} from "../escapeFullscreenGuard";
import { captureMainException } from "../telemetry/posthog";
import { isAppNavigationUrl, openExternalHttpUrl } from "./externalUrl";

export interface CreateMainWindowDeps {
  mainDir: string;
  settingsManager: SettingsManager;
  getMainWindow(): BrowserWindow | null;
  setMainWindow(window: BrowserWindow | null): void;
  getRendererControlledFullscreen(): boolean;
  setRendererControlledFullscreen(value: boolean): void;
  getPendingDirectLaunchRequest(): DirectLaunchRequest | null;
  emitDirectLaunchRequest(request: DirectLaunchRequest): void;
  getPointerLockActive(): boolean;
  setPointerLockActive(active: boolean): void;
  getPointerLockEscapeCaptureUntilMs(): number;
  setPointerLockEscapeCaptureUntilMs(value: number): void;
  getStreamInputActive(): boolean;
  setStreamInputActive(active: boolean): void;
  getNativeRawInputOwnsEscape(): boolean;
  setNativeRawInputOwnsEscape(ownsEscape: boolean): void;
  /** Additive (v9): the secondary cloud-stream window, if one is open. */
  getStreamWindow?(): BrowserWindow | null;
  /** Whether the app is fully quitting (skip close-choice dialog). */
  isQuittingFully(): boolean;
  /** Mark the app as fully quitting. */
  setQuittingFully(value: boolean): void;
  quitApp?(): void;
}

export async function createMainWindow(
  deps: CreateMainWindowDeps,
): Promise<void> {
  const preloadMjsPath = join(deps.mainDir, "../preload/index.mjs");
  const preloadJsPath = join(deps.mainDir, "../preload/index.js");
  const preloadPath = existsSync(preloadMjsPath)
    ? preloadMjsPath
    : preloadJsPath;

  const settings = deps.settingsManager.getAll();
  let escapeHoldState: EscapeHoldCaptureState = { keyDownCaptured: false, holdFired: false };
  let escapeHoldTimer: NodeJS.Timeout | null = null;
  const clearEscapeHoldTimer = (): void => {
    if (escapeHoldTimer !== null) {
      clearTimeout(escapeHoldTimer);
      escapeHoldTimer = null;
    }
  };

  // Console mode (big picture): mirror GeForce NOW's TV mode by launching
  // fullscreen with the controller-oriented shell enabled.
  if (settings.launchInConsoleMode && !settings.controllerMode) {
    deps.settingsManager.set("controllerMode", true);
  }

  // Direct-launch arguments always start fullscreen; the renderer applies the
  // console shell for the run without persisting the Controller Mode setting.
  const startFullscreen =
    settings.launchInConsoleMode ||
    deps.getPendingDirectLaunchRequest() !== null;

  const window = new BrowserWindow({
    width: settings.windowWidth || 1400,
    height: settings.windowHeight || 900,
    minWidth: 1024,
    minHeight: 680,
    ...(startFullscreen ? { fullscreen: true } : {}),
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
    // PERF: don't paint an empty white frame before the renderer is ready.
    // This removes the visible "flash + freeze" at startup on slow machines.
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // PERF: keep the compositor running at full rate; combined with the
      // disable-renderer-backgrounding switch this stops the stream from
      // stuttering when the window loses focus.
      backgroundThrottling: false,
      // PERF: spellcheck loads dictionaries and walks every text node.
      // The client has no long-form text input, so it is pure overhead.
      spellcheck: false,
    },
  });

  // Show only once the first real frame is ready.
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) window.show();
  });
  deps.setMainWindow(window);

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("[Main] Renderer process gone:", details);
    captureMainException(new Error(`Renderer process gone: ${details.reason}`), {
      reason: details.reason,
      exit_code: details.exitCode,
    });
  });
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level < 2) return;
    console.error(`[renderer:console:${level}]`, message, sourceId ? `(${sourceId}:${line})` : "");
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalHttpUrl(url).catch((error) => {
      console.warn(
        "Blocked non-external window open:",
        error instanceof Error ? error.message : error,
      );
    });
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isAppNavigationUrl(url, deps.mainDir)) {
      return;
    }

    event.preventDefault();
    void openExternalHttpUrl(url).catch((error) => {
      console.warn(
        "Blocked app window navigation:",
        error instanceof Error ? error.message : error,
      );
    });
  });

  if (process.platform === "win32") {
    // Keep native window fullscreen in sync with HTML fullscreen so Windows treats
    // stream playback like a real fullscreen window instead of only DOM fullscreen.
    window.webContents.on("enter-html-full-screen", () => {
      const mainWindow = deps.getMainWindow();
      if (
        mainWindow &&
        !mainWindow.isDestroyed() &&
        !mainWindow.isFullScreen()
      ) {
        mainWindow.setFullScreen(true);
      }
    });

    window.webContents.on("leave-html-full-screen", () => {
      if (deps.getRendererControlledFullscreen()) {
        return;
      }
      const mainWindow = deps.getMainWindow();
      if (
        mainWindow &&
        !mainWindow.isDestroyed() &&
        mainWindow.isFullScreen()
      ) {
        mainWindow.setFullScreen(false);
      }
    });
  }

  // Track pointer-lock state from renderer; used to decide whether to swallow
  // Escape at the native level (before Chromium handles it).
  ipcMain.on(
    IPC_CHANNELS.POINTER_LOCK_CHANGE,
    (_ev, active: boolean, suppressEscapeFullscreenGrace?: boolean) => {
      const pointerLockActive = Boolean(active);
      deps.setPointerLockActive(pointerLockActive);
      deps.setPointerLockEscapeCaptureUntilMs(
        nextPointerLockEscapeCaptureUntilMs(
          pointerLockActive,
          Boolean(suppressEscapeFullscreenGrace),
          Date.now(),
        ),
      );
    },
  );

  ipcMain.on(
    IPC_CHANNELS.NATIVE_INPUT_MODE_CHANGE,
    (_ev, active: boolean, rawInputOwnsEscape: boolean) => {
      const streamInputActive = Boolean(active);
      deps.setStreamInputActive(streamInputActive);
      deps.setNativeRawInputOwnsEscape(
        streamInputActive && Boolean(rawInputOwnsEscape),
      );
    },
  );

  // Intercept Escape early to avoid Chromium exiting fullscreen before the
  // renderer can forward the key to the remote session. Keep a short fullscreen
  // grace window after pointer lock drops so rapid repeated Escape presses cannot
  // win the race before the renderer re-locks the pointer.
  window.webContents.on("before-input-event", (event, input) => {
    try {
      const mainWindow = deps.getMainWindow();
      const resolved = resolveEscapeHoldCaptureAction(
        input,
        {
          allowEscapeToExitFullscreen: Boolean(
            deps.settingsManager?.get("allowEscapeToExitFullscreen"),
          ),
          streamInputActive: deps.getStreamInputActive(),
          pointerLockActive: deps.getPointerLockActive(),
          rendererControlledFullscreen: deps.getRendererControlledFullscreen(),
          windowFullscreen: Boolean(
            mainWindow &&
              !mainWindow.isDestroyed() &&
              mainWindow.isFullScreen(),
          ),
          pointerLockEscapeCaptureUntilMs:
            deps.getPointerLockEscapeCaptureUntilMs(),
          nowMs: Date.now(),
        },
        escapeHoldState,
      );
      escapeHoldState = resolved.nextHoldState;

      if (resolved.action === "ignore") return;
      event.preventDefault();

      if (resolved.action === "arm-hold") {
        clearEscapeHoldTimer();
        escapeHoldTimer = setTimeout(() => {
          escapeHoldTimer = null;
          const activeWindow = deps.getMainWindow();
          if (!activeWindow || activeWindow.isDestroyed()) return;
          if (!activeWindow.isFullScreen() && !deps.getRendererControlledFullscreen()) return;
          escapeHoldState = markEscapeHoldFired(escapeHoldState);
          activeWindow.webContents.send(IPC_CHANNELS.EXIT_FULLSCREEN);
        }, ESCAPE_HOLD_TO_EXIT_FULLSCREEN_MS);
        return;
      }

      if (resolved.action === "tap") {
        clearEscapeHoldTimer();
        // Windows internal native mode receives the same physical key through
        // its persistent RawInput keyboard sink. Forward only when Electron is
        // the input owner so the remote session sees exactly one Escape tap.
        if (!deps.getNativeRawInputOwnsEscape()) {
          console.log("[EscapeInput] Forwarding captured Escape tap to the stream session");
          mainWindow?.webContents.send(IPC_CHANNELS.EXTERNAL_ESCAPE);
        }
      } else if (resolved.action === "hold-consumed-keyup") {
        clearEscapeHoldTimer();
      }
    } catch {
      // ignore errors - interception is best-effort
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await window.loadFile(join(deps.mainDir, "../../dist/index.html"));
  }
  const pendingDirectLaunchRequest = deps.getPendingDirectLaunchRequest();
  if (pendingDirectLaunchRequest) {
    deps.emitDirectLaunchRequest(pendingDirectLaunchRequest);
  }

  // Additive (v9): instead of the native OS confirm dialog, ask the
  // renderer to show a custom in-app popup (styled like the rest of the
  // app) and wait for the user's choice over IPC. This never runs unless
  // the user actually clicks the window's close (X) button, and it never
  // touches any other existing window behavior.
  let pendingCloseChoiceListener: ((_event: Electron.IpcMainEvent, choice: "tray" | "quit" | "cancel") => void) | null = null;
  const clearPendingCloseChoiceListener = (): void => {
    if (pendingCloseChoiceListener) {
      ipcMain.removeListener(IPC_CHANNELS.MAIN_WINDOW_CLOSE_CHOICE_RESPONSE, pendingCloseChoiceListener);
      pendingCloseChoiceListener = null;
    }
  };

  window.on("close", (event) => {
    if (deps.isQuittingFully()) return;
    if (pendingCloseChoiceListener) {
      // A close prompt is already pending a response — don't stack another.
      event.preventDefault();
      return;
    }

    event.preventDefault();

    let streamWindow: BrowserWindow | null = null;
    try {
      streamWindow = deps.getStreamWindow ? deps.getStreamWindow() : null;
    } catch {
      streamWindow = null;
    }
    const hasStreamWindow = Boolean(streamWindow && !streamWindow.isDestroyed());

    let settled = false;
    const fallbackTimer = setTimeout(() => {
      // Safety net: if the renderer never responds (e.g. it is stuck or the
      // popup failed to render), fall back to the least destructive choice
      // (minimize to tray) instead of leaving the app unclosable.
      if (settled) return;
      settled = true;
      clearPendingCloseChoiceListener();
      if (!window.isDestroyed()) window.hide();
    }, 10000);

    pendingCloseChoiceListener = (_event, choice) => {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackTimer);
      clearPendingCloseChoiceListener();
      if (choice === "tray") {
        if (!window.isDestroyed()) window.hide();
      } else if (choice === "quit") {
        deps.setQuittingFully(true);
        if (deps.quitApp) { deps.quitApp(); } else { app.quit(); }
      }
      // choice === "cancel": do nothing, window stays open.
    };
    ipcMain.once(IPC_CHANNELS.MAIN_WINDOW_CLOSE_CHOICE_RESPONSE, pendingCloseChoiceListener);

    try {
      window.webContents.send(IPC_CHANNELS.MAIN_WINDOW_REQUEST_CLOSE_CHOICE, { hasStreamWindow });
    } catch (error) {
      console.warn("[Main] Failed to request close choice from renderer, minimizing to tray instead:", error);
      if (!settled) {
        settled = true;
        clearTimeout(fallbackTimer);
        clearPendingCloseChoiceListener();
        if (!window.isDestroyed()) window.hide();
      }
    }
  });

  window.on("closed", () => {
    clearEscapeHoldTimer();
    clearPendingCloseChoiceListener();
    escapeHoldState = { keyDownCaptured: false, holdFired: false };
    deps.setMainWindow(null);
    deps.setRendererControlledFullscreen(false);
    deps.setPointerLockActive(false);
    deps.setPointerLockEscapeCaptureUntilMs(0);
    deps.setStreamInputActive(false);
    deps.setNativeRawInputOwnsEscape(false);
  });
}
