import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type {
  IceCandidatePayload,
  KeyframeRequest,
  MainToRendererSignalingEvent,
  SendAnswerRequest,
  Settings,
  SignalingConnectRequest,
} from "@shared/gfn";
import { GfnSignalingClient } from "../platforms/gfn/signaling";
import type { SettingsManager } from "../settings";

export interface SignalingCoordinatorDeps {
  ipcMain: IpcMain;
  mainDir: string;
  settingsManager: SettingsManager;
  getMainWindow(): BrowserWindow | null;
}

/**
 * WebRTC Ultra signaling coordinator.
 *
 * The renderer owns the single WebRTC media/input path. Main only maintains the
 * signaling socket and forwards SDP/ICE/keyframe events; no native streamer,
 * GStreamer surface, RawInput bridge, or native fallback is started here.
 */
export class SignalingCoordinator {
  private signalingClient: GfnSignalingClient | null = null;
  private signalingClientKey: string | null = null;

  constructor(private readonly deps: SignalingCoordinatorDeps) {}

  registerIpcHandlers(): void {
    const { ipcMain } = this.deps;

    ipcMain.handle(
      IPC_CHANNELS.CONNECT_SIGNALING,
      async (_event: IpcMainInvokeEvent, payload: SignalingConnectRequest): Promise<void> => {
        await this.connectSignaling(payload);
      },
    );

    ipcMain.handle(IPC_CHANNELS.DISCONNECT_SIGNALING, async (): Promise<void> => {
      await this.disconnectSignaling();
    });

    ipcMain.handle(
      IPC_CHANNELS.SEND_ANSWER,
      async (_event: IpcMainInvokeEvent, payload: SendAnswerRequest) => {
        if (!this.signalingClient) {
          throw new Error("Signaling is not connected");
        }
        return this.signalingClient.sendAnswer(payload);
      },
    );

    ipcMain.handle(
      IPC_CHANNELS.SEND_ICE_CANDIDATE,
      async (_event: IpcMainInvokeEvent, payload: IceCandidatePayload) => {
        if (!this.signalingClient) {
          throw new Error("Signaling is not connected");
        }
        return this.signalingClient.sendIceCandidate(payload);
      },
    );

    ipcMain.handle(
      IPC_CHANNELS.REQUEST_KEYFRAME,
      async (_event: IpcMainInvokeEvent, payload: KeyframeRequest) => {
        if (!this.signalingClient) {
          throw new Error("Signaling is not connected");
        }
        return this.signalingClient.requestKeyframe(payload);
      },
    );
  }

  disconnectForShutdown(options: {
    emitDisconnectEvent: boolean;
    reason: string;
  }): void {
    if (options.emitDisconnectEvent) {
      this.signalingClient?.disconnect();
    }
    this.signalingClient = null;
    this.signalingClientKey = null;
  }

  /**
   * Settings are persisted by the main settings manager. WebRTC Ultra does not
   * need a native restart when a setting changes, so this hook intentionally
   * remains as a compatibility boundary for existing IPC callers.
   */
  applySettingsChange<K extends keyof Settings>(_key: K, _value: Settings[K]): void {
    // WebRTC renegotiation/recovery is driven by the renderer session lifecycle.
  }

  private async connectSignaling(payload: SignalingConnectRequest): Promise<void> {
    const nextKey = `${payload.sessionId}|${payload.signalingServer}|${payload.signalingUrl ?? ""}`;

    if (this.signalingClient && this.signalingClientKey === nextKey) {
      console.log("[Signaling] Reuse existing signaling connection (duplicate connect request ignored)");
      return;
    }

    if (this.signalingClient) {
      this.signalingClient.disconnect();
    }

    const signalingClient = new GfnSignalingClient(
      payload.signalingServer,
      payload.sessionId,
      payload.signalingUrl,
    );
    this.signalingClient = signalingClient;
    this.signalingClientKey = nextKey;
    signalingClient.onEvent((event) => {
      // A replaced signaling client may still deliver queued events while its
      // socket is closing. Do not route those events into the current session.
      if (this.signalingClient !== signalingClient) {
        return;
      }
      this.routeSignalingEvent(event);
    });

    try {
      await signalingClient.connect();
    } catch (error) {
      // Only tear down resources owned by this connection attempt.
      if (this.signalingClient === signalingClient) {
        this.signalingClient = null;
        this.signalingClientKey = null;
      }
      throw error;
    }
  }

  private async disconnectSignaling(): Promise<void> {
    this.signalingClient?.disconnect();
    this.signalingClient = null;
    this.signalingClientKey = null;
  }

  private emitToRenderer(event: MainToRendererSignalingEvent): void {
    const mainWindow = this.deps.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.SIGNALING_EVENT, event);
    }
  }

  private routeSignalingEvent(event: MainToRendererSignalingEvent): void {
    this.emitToRenderer(event);
  }
}

export function registerSignalingIpcHandlers(
  deps: SignalingCoordinatorDeps,
): SignalingCoordinator {
  const coordinator = new SignalingCoordinator(deps);
  coordinator.registerIpcHandlers();
  return coordinator;
}

/** Kept for settings IPC compatibility while callers migrate to server profiles. */
export function normalizeMaxBitrateMbps(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(150, Math.max(5, Math.round(value)));
}
