import { useEffect } from "react";
import type { MainToRendererSignalingEvent, Settings } from "@shared/gfn";

import { dispatchStreamShortcutAction } from "../../streamShortcutActions";
import {
  ICE_DISCONNECTED_RECOVERY_GRACE_MS,
  RECOVERABLE_STREAM_STATUSES,
  SIGNALING_REMOTE_ICE_GRACE_MS,
  readStreamClipboardText,
  sendStreamClipboardPaste,
} from "../../lib/streamSessionHelpers";
import { streamStatusToLoadingStage } from "../../lib/sessionState";
import { decideSignalingDisconnect } from "../../lib/streamRecoveryDecisions";
import { warningMessage, warningTone } from "../../lib/sessionWarnings";
import { GfnWebRtcClient } from "../../platforms/gfn/webrtcClient";
import type { StreamDiagnosticsStore } from "../../utils/streamDiagnosticsStore";
import type { StreamRuntimeState } from "./useStreamRuntimeState";

type TranslateFunction = typeof import("../../i18n").t;
type ResetLaunchRuntime = (options?: {
  keepLaunchError?: boolean;
  keepStreamingContext?: boolean;
}) => void;

export interface SignalingEventOptions {
  runtime: StreamRuntimeState;
  attemptSessionRecovery: (reason: string) => Promise<boolean>;
  diagnosticsStore: StreamDiagnosticsStore;
  handleExpectedSessionClose: (reason: string) => void;
  markDiscordStreamStarted: () => void;
  refreshNavbarActiveSession: () => Promise<void>;
  resetLaunchRuntime: ResetLaunchRuntime;
  scheduleStableRecoveryReset: (sessionId: string) => void;
  settings: Settings;
  t: TranslateFunction;
}

export function useSignalingEvents({
  runtime,
  attemptSessionRecovery,
  diagnosticsStore,
  handleExpectedSessionClose,
  markDiscordStreamStarted,
  refreshNavbarActiveSession,
  resetLaunchRuntime,
  scheduleStableRecoveryReset,
  settings,
  t,
}: SignalingEventOptions): void {
  const {
    appUnloadingRef,
    audioRef,
    awaitingRecoveryRemoteIceRef,
    clientRef,
    hasConfirmedRemoteIceRef,
    iceDisconnectedRecoveryTimerRef,
    latestIceConnectionStateRef,
    launchInFlightRef,
    pendingControlledDisconnectsRef,
    remoteIceGraceTimerRef,
    remoteIceRecoveryGenerationRef,
    remoteIceSeenForSessionRef,
    sessionRef,
    setLaunchError,
    setRemoteStreamWarning,
    setStreamStatus,
    signalingRecoveryRef,
    streamMicLevel,
    streamStatusRef,
    streamVolume,
    videoRef,
  } = runtime;

  // Signaling events
  useEffect(() => {
    const ensureWebRtcClient = (): GfnWebRtcClient | null => {
      if (clientRef.current) {
        return clientRef.current;
      }
      if (!videoRef.current || !audioRef.current) {
        return null;
      }

      clientRef.current = new GfnWebRtcClient({
        videoElement: videoRef.current,
        audioElement: audioRef.current,
        autoFullScreen: settings.autoFullScreen,
        microphoneMode: settings.microphoneMode,
        microphoneDeviceId: settings.microphoneDeviceId || undefined,
        nativeCursorOverlay: settings.nativeCursorOverlay,
        mouseSensitivity: settings.mouseSensitivity,
        mouseAcceleration: settings.mouseAcceleration,
        keyboardLayout: settings.keyboardLayout,
        clipboardPaste: settings.clipboardPaste,
        readClipboardText: readStreamClipboardText,
        onLog: (line: string) => console.log(`[WebRTC] ${line}`),
        onStats: (stats) => diagnosticsStore.set(stats),
        onTimeWarning: (warning) => {
          setRemoteStreamWarning({
            code: warning.code,
            message: warningMessage(t, warning.code),
            tone: warningTone(warning.code),
            secondsLeft: warning.secondsLeft,
          });
        },
        onMicStateChange: (state) => {
          console.log(`[App] Mic state: ${state.state}${state.deviceLabel ? ` (${state.deviceLabel})` : ""}`);
        },
        onControllerMetaPress: () => {
          if (streamStatusRef.current === "streaming") {
            dispatchStreamShortcutAction("toggleSidebar");
          }
        },
        onIceConnectionStateChange: (iceState) => {
          latestIceConnectionStateRef.current = iceState;
          if (iceDisconnectedRecoveryTimerRef.current !== null) {
            window.clearTimeout(iceDisconnectedRecoveryTimerRef.current);
            iceDisconnectedRecoveryTimerRef.current = null;
          }
          if (appUnloadingRef.current) {
            return;
          }
          if (streamStatusRef.current !== "streaming") {
            return;
          }
          if (iceState === "failed") {
            console.warn("[Recovery] ICE failed; attempting targeted recovery");
            void attemptSessionRecovery("ICE failed").catch((error) => {
              console.error("[Recovery] ICE-failed recovery failed:", error);
            });
            return;
          }
          if (iceState === "disconnected") {
            iceDisconnectedRecoveryTimerRef.current = window.setTimeout(() => {
              iceDisconnectedRecoveryTimerRef.current = null;
              if (appUnloadingRef.current || streamStatusRef.current !== "streaming") {
                return;
              }
              if (latestIceConnectionStateRef.current !== "disconnected") {
                return;
              }
              console.warn("[Recovery] ICE remained disconnected; attempting targeted recovery");
              void attemptSessionRecovery("ICE disconnected timeout").catch((error) => {
                console.error("[Recovery] ICE-disconnected recovery failed:", error);
              });
            }, ICE_DISCONNECTED_RECOVERY_GRACE_MS);
          }
        },
      });
      clientRef.current.setOutputVolume(streamVolume);
      clientRef.current.setMicrophoneLevel(streamMicLevel);
      if (settings.microphoneMode !== "disabled") {
        void clientRef.current.startMicrophone();
      }
      return clientRef.current;
    };


    const unsubscribe = window.openNow.onSignalingEvent(async (event: MainToRendererSignalingEvent) => {
      console.log(`[App] Signaling event: ${event.type}`, event.type === "offer" ? `(SDP ${event.sdp.length} chars)` : "", event.type === "remote-ice" ? event.candidate : "");
      try {
        if (event.type === "offer") {
          pendingControlledDisconnectsRef.current = 0;
          const activeSession = sessionRef.current;
          if (!activeSession) {
            console.warn("[App] Received offer but no active session in sessionRef!");
            return;
          }
          const shouldEnforceRemoteIceGrace = awaitingRecoveryRemoteIceRef.current;
          remoteIceSeenForSessionRef.current = null;
          hasConfirmedRemoteIceRef.current = false;
          if (remoteIceGraceTimerRef.current !== null) {
            window.clearTimeout(remoteIceGraceTimerRef.current);
            remoteIceGraceTimerRef.current = null;
          }
          const expectedSessionId = activeSession.sessionId;
          const recoveryGenerationAtOffer = signalingRecoveryRef.current.generation;
          if (shouldEnforceRemoteIceGrace) {
            remoteIceGraceTimerRef.current = window.setTimeout(() => {
              remoteIceGraceTimerRef.current = null;
              if (sessionRef.current?.sessionId !== expectedSessionId) {
                return;
              }
              if (remoteIceSeenForSessionRef.current === expectedSessionId) {
                return;
              }
              if (remoteIceRecoveryGenerationRef.current === recoveryGenerationAtOffer) {
                return;
              }
              if (!RECOVERABLE_STREAM_STATUSES.includes(streamStatusRef.current)) {
                return;
              }
              awaitingRecoveryRemoteIceRef.current = false;
              remoteIceRecoveryGenerationRef.current = recoveryGenerationAtOffer;
              console.warn(
                `[Recovery] No remote ICE received within ${SIGNALING_REMOTE_ICE_GRACE_MS}ms after offer; forcing targeted recovery`,
              );
              void attemptSessionRecovery("No remote ICE received after offer").catch((error) => {
                console.error("[Recovery] ICE-timeout recovery failed:", error);
              });
            }, SIGNALING_REMOTE_ICE_GRACE_MS);
          }
          console.log("[App] Active session for offer:", JSON.stringify({
            sessionId: activeSession.sessionId,
            serverIp: activeSession.serverIp,
            signalingServer: activeSession.signalingServer,
            mediaConnectionInfo: activeSession.mediaConnectionInfo,
            iceServersCount: activeSession.iceServers?.length,
          }));

          const client = ensureWebRtcClient();

          if (client) {
            await client.handleOffer(event.sdp, activeSession, {
              codec: settings.codec,
              colorQuality: settings.colorQuality,
              resolution: settings.resolution,
              fps: settings.fps,
              maxBitrateKbps: settings.maxBitrateMbps * 1000,
              streamTransitionDiagnostics: settings.streamTransitionDiagnostics,
            });
            setLaunchError(null);
            setStreamStatus("streaming");
            markDiscordStreamStarted();
            scheduleStableRecoveryReset(activeSession.sessionId);
            console.log(
              "[Stream] Offer applied; use [WebRTC] logs for ICE/video dimensions. signalingServer=%s media=%s",
              activeSession.signalingServer,
              activeSession.mediaConnectionInfo
                ? `${activeSession.mediaConnectionInfo.ip}:${activeSession.mediaConnectionInfo.port}`
                : "n/a",
            );
          }
        } else if (event.type === "remote-ice") {
          remoteIceSeenForSessionRef.current = sessionRef.current?.sessionId ?? null;
          hasConfirmedRemoteIceRef.current = true;
          awaitingRecoveryRemoteIceRef.current = false;
          if (remoteIceGraceTimerRef.current !== null) {
            window.clearTimeout(remoteIceGraceTimerRef.current);
            remoteIceGraceTimerRef.current = null;
          }
          await clientRef.current?.addRemoteCandidate(event.candidate);
        } else if (event.type === "disconnected") {
          const iceState = latestIceConnectionStateRef.current;
          const decision = decideSignalingDisconnect({
            appUnloading: appUnloadingRef.current,
            streamStatus: streamStatusRef.current,
            reason: event.reason,
            hasConfirmedRemoteIce: hasConfirmedRemoteIceRef.current,
            iceState,
            pendingControlledDisconnects: pendingControlledDisconnectsRef.current,
          });
          if (decision === "ignore-app-unloading") {
            console.log("[Recovery] Ignoring signaling disconnect during app shutdown");
            return;
          }
          if (decision === "expected-session-close") {
            handleExpectedSessionClose(event.reason);
            return;
          }
          if (decision === "ignore-active-ice") {
            console.log(`[Recovery] Ignoring signaling disconnect while ICE state is ${iceState}`);
            return;
          }
          if (decision === "fail-before-remote-ice") {
            console.warn("[Recovery] Skipping auto-recovery: disconnected before remote ICE handshake");
            clientRef.current?.dispose();
            clientRef.current = null;
            setLaunchError({
              stage: streamStatusToLoadingStage(streamStatusRef.current),
              title: t("errors.sessionConnectionLostTitle"),
              description: t("errors.resumeAttachFailedDescription"),
            });
            resetLaunchRuntime({ keepLaunchError: true, keepStreamingContext: true });
            void refreshNavbarActiveSession();
            launchInFlightRef.current = false;
            return;
          }
          if (remoteIceGraceTimerRef.current !== null) {
            window.clearTimeout(remoteIceGraceTimerRef.current);
            remoteIceGraceTimerRef.current = null;
          }
          remoteIceSeenForSessionRef.current = null;
          awaitingRecoveryRemoteIceRef.current = false;
          if (decision === "ignore-controlled-disconnect") {
            pendingControlledDisconnectsRef.current -= 1;
            console.log("[Recovery] Ignoring controlled signaling disconnect");
            return;
          }
          console.warn("Signaling disconnected:", event.reason);
          const recovered = await attemptSessionRecovery(event.reason).catch((error) => {
            console.error("[Recovery] Signaling recovery failed:", error);
            throw error;
          });
          if (!recovered) {
            if (
              signalingRecoveryRef.current.explicitShutdown
              || !RECOVERABLE_STREAM_STATUSES.includes(streamStatusRef.current)
            ) {
              console.log("[Recovery] Ignoring disconnect after explicit shutdown or non-recoverable status");
              return;
            }
            clientRef.current?.dispose();
            clientRef.current = null;
            setLaunchError({
              stage: streamStatusToLoadingStage(streamStatusRef.current),
              title: t("errors.sessionConnectionLostTitle"),
              description: t("errors.sessionConnectionLostDescription"),
            });
            resetLaunchRuntime({ keepLaunchError: true, keepStreamingContext: true });
            void refreshNavbarActiveSession();
            launchInFlightRef.current = false;
          }
        } else if (event.type === "error") {
          console.error("Signaling error:", event.message);
        }
      } catch (error) {
        if (appUnloadingRef.current) {
          console.log("[Recovery] Suppressing signaling handler errors during app shutdown");
          return;
        }
        if (
          signalingRecoveryRef.current.explicitShutdown
          || !RECOVERABLE_STREAM_STATUSES.includes(streamStatusRef.current)
        ) {
          console.log("[Recovery] Suppressing signaling error after explicit shutdown or non-recoverable status");
          return;
        }
        console.error("Signaling event error:", error);
        clientRef.current?.dispose();
        clientRef.current = null;
        const message = error instanceof Error ? error.message : t("errors.sessionResumeFailedDescription");
        setLaunchError({
          stage: streamStatusToLoadingStage(streamStatusRef.current),
          title: t("errors.sessionConnectionLostTitle"),
          description: message,
        });
        resetLaunchRuntime({ keepLaunchError: true, keepStreamingContext: true });
        void refreshNavbarActiveSession();
        launchInFlightRef.current = false;
      }
    });

    return () => unsubscribe();
  }, [attemptSessionRecovery, diagnosticsStore, handleExpectedSessionClose, markDiscordStreamStarted, refreshNavbarActiveSession, resetLaunchRuntime, scheduleStableRecoveryReset, settings, streamMicLevel, streamVolume, t]);

}
