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

export interface SignalingCoordinatorDeps {
  ipcMain: IpcMain;
  getMainWindow(): BrowserWindow | null;
}

/**
 * Main-process WebRTC signaling coordinator.
 *
 * The client intentionally forwards the upstream signaling contract unchanged:
 * offer/answer, remote ICE, keyframe requests and nvstSdp are handled by the
 * existing GfnSignalingClient/WebRTC renderer path. The build exposes only
 * this WebRTC transport at runtime.
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
   * Kept as a stable settings-IPC hook. WebRTC reads stream settings when a
   * session is created; no native process needs to be restarted on changes.
   */
  applySettingsChange<K extends keyof Settings>(_key: K, _value: Settings[K]): void {
    // Intentionally empty: there is no secondary/native renderer to restart.
  }

  private async connectSignaling(payload: SignalingConnectRequest): Promise<void> {
    const nextKey = `${payload.sessionId}|${payload.signalingServer}|${payload.signalingUrl ?? ""}`;

    if (this.signalingClient && this.signalingClientKey === nextKey) {
      console.log(
        "[Signaling] Reuse existing signaling connection (duplicate connect request ignored)",
      );
      return;
    }

    if (this.signalingClient) {
      this.signalingClient.disconnect();
    }

    this.signalingClient = new GfnSignalingClient(
      payload.signalingServer,
      payload.sessionId,
      payload.signalingUrl,
    );
    this.signalingClientKey = nextKey;
    this.signalingClient.onEvent((event) => this.routeSignalingEvent(event));

    try {
      await this.signalingClient.connect();
    } catch (error) {
      this.signalingClient = null;
      this.signalingClientKey = null;
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
