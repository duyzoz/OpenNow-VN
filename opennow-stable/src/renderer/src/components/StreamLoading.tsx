import { Cpu, Monitor, Radio, Wifi, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { JSX, Ref } from "react";
import { m, useReducedMotion } from "motion/react";
import {
  getPreferredSessionAdMediaUrl,
  getSessionAdItems,
  getSessionAdMessage,
  isSessionAdsRequired,
  isSessionQueuePaused,
} from "@shared/gfn";
import type { SessionAdInfo, SessionAdState } from "@shared/gfn";
import { getStoreDisplayName, getStoreIconComponent } from "./GameCard";
import { QueueAdPreview, type QueueAdPlaybackEvent, type QueueAdPreviewHandle } from "./QueueAdPreview";
import { LazyShaderAtmosphere } from "./LazyShaderAtmosphere";
import { useTranslation } from "../i18n";
import { getStatusPulseMotion } from "./MotionProvider";
import { getGameArtworkInitials } from "../lib/gameArtwork";

type TranslateFunction = typeof import("../i18n").t;

const launchStages = [
  { id: "queue", icon: Radio },
  { id: "setup", icon: Cpu },
  { id: "connecting", icon: Wifi },
  { id: "ready", icon: Monitor },
] as const;

export interface StreamLoadingProps {
  gameTitle: string;
  gameCover?: string;
  gameLogo?: string;
  platformStore?: string;
  status: "queue" | "setup" | "starting" | "connecting";
  launchStartedAtMs?: number;
  queuePosition?: number;
  estimatedWait?: string;
  adState?: SessionAdState;
  activeAd?: SessionAdInfo;
  activeAdMediaUrl?: string;
  error?: {
    title: string;
    description: string;
    code?: string;
    actionLabel?: string;
  };
  onAdPlaybackEvent?: (event: QueueAdPlaybackEvent, adId: string) => void;
  adPreviewRef?: Ref<QueueAdPreviewHandle>;
  onErrorAction?: () => void;
  onCancel: () => void;
}

function getStatusMessage(
  t: TranslateFunction,
  status: StreamLoadingProps["status"],
  queuePosition?: number,
  adState?: SessionAdState,
  isError = false,
): string {
  if (isError) return t("streamLoading.status.gameLaunchFailed");
  if (isSessionQueuePaused(adState)) return t("streamLoading.status.queuePaused");

  switch (status) {
    case "queue":
      return queuePosition
        ? t("streamLoading.status.positionInQueue", { position: queuePosition })
        : t("streamLoading.status.syncingQueue");
    case "setup":
      return t("streamLoading.status.settingUpRig");
    case "starting":
      return t("streamLoading.status.startingStream");
    case "connecting":
      return t("streamLoading.status.connectingToServer");
  }
}

function getPhaseDetail(t: TranslateFunction, status: StreamLoadingProps["status"]): string {
  switch (status) {
    case "queue":
      return t("streamLoading.cozy.queue");
    case "setup":
      return t("streamLoading.cozy.setup");
    case "starting":
      return t("streamLoading.cozy.starting");
    case "connecting":
      return t("streamLoading.cozy.connecting");
  }
}

function getNextStep(t: TranslateFunction, status: StreamLoadingProps["status"]): string {
  switch (status) {
    case "queue":
      return t("streamLoading.steps.setup");
    case "setup":
      return t("streamLoading.status.startingStream");
    case "starting":
      return t("streamLoading.steps.connect");
    case "connecting":
      return t("streamLoading.steps.ready");
  }
}

function getActiveStage(status: StreamLoadingProps["status"]): number {
  if (status === "queue") return 0;
  if (status === "setup") return 1;
  return 2;
}

function formatWaitTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function getAdSummary(t: TranslateFunction, adState?: SessionAdState): string | null {
  if (!isSessionAdsRequired(adState)) return null;
  const message = getSessionAdMessage(adState);
  if (message) return message;
  if (isSessionQueuePaused(adState)) return t("streamLoading.ads.resumeToStayInQueue");
  const ads = getSessionAdItems(adState);
  return ads.length > 0
    ? t("streamLoading.ads.availableForProgression", { count: ads.length })
    : t("streamLoading.ads.playbackRequired");
}

export function StreamLoading({
  gameTitle,
  gameCover,
  gameLogo,
  platformStore,
  status,
  launchStartedAtMs,
  queuePosition,
  estimatedWait,
  adState,
  activeAd,
  activeAdMediaUrl,
  error,
  onAdPlaybackEvent,
  adPreviewRef,
  onErrorAction,
  onCancel,
}: StreamLoadingProps): JSX.Element {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const statusPulseMotion = getStatusPulseMotion(reducedMotion);
  const [mountedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [queueSamples, setQueueSamples] = useState<Array<{ position: number; at: number }>>([]);
  const [queueMovement, setQueueMovement] = useState(0);
  const previousQueuePositionRef = useRef<number | null>(null);

  const hasError = Boolean(error);
  const effectiveStartedAt = launchStartedAtMs ?? mountedAt;
  const statusMessage = getStatusMessage(t, status, queuePosition, adState, hasError);
  const platformName = platformStore ? getStoreDisplayName(platformStore) : "";
  const squareArtwork = gameLogo;
  const artworkInitials = getGameArtworkInitials(gameTitle);
  const PlatformIcon = platformStore ? getStoreIconComponent(platformStore) : null;
  const adSummary = getAdSummary(t, adState);
  const cachedAdMediaUrl = activeAdMediaUrl ?? getPreferredSessionAdMediaUrl(activeAd);
  const activeStage = getActiveStage(status);
  const hasQueuePosition = typeof queuePosition === "number" && Number.isFinite(queuePosition) && queuePosition > 0;
  const computedQueueWaitSeconds = (() => {
    if (!hasQueuePosition || queueSamples.length < 2) return undefined;
    const first = queueSamples[0];
    const last = queueSamples[queueSamples.length - 1];
    const dropped = first.position - last.position;
    const elapsed = (last.at - first.at) / 1000;
    if (dropped <= 0 || elapsed < 2) return undefined;
    return Math.max(1, Math.round((queuePosition / dropped) * elapsed));
  })();
  const computedWaitLabel = computedQueueWaitSeconds === undefined
    ? undefined
    : computedQueueWaitSeconds < 60
      ? t("streamLoading.telemetry.lessThanMinute")
      : t("streamLoading.telemetry.minutes", { count: Math.ceil(computedQueueWaitSeconds / 60) });

  useEffect(() => {
    if (!hasQueuePosition || queuePosition === undefined) {
      previousQueuePositionRef.current = null;
      return;
    }

    const now = Date.now();
    const previous = previousQueuePositionRef.current;
    if (previous !== null && previous !== queuePosition) {
      setQueueMovement(queuePosition < previous ? previous - queuePosition : 0);
    }
    previousQueuePositionRef.current = queuePosition;
    setQueueSamples((current) => {
      const recent = current.filter((sample) => now - sample.at <= 120_000);
      const last = recent[recent.length - 1];
      if (last?.position === queuePosition) return recent;
      return [...recent, { position: queuePosition, at: now }].slice(-5);
    });
  }, [hasQueuePosition, queuePosition]);

  useEffect(() => {
    if (hasError) return undefined;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - effectiveStartedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [effectiveStartedAt, hasError]);

  return (
    <div
      className={`sload${hasError ? " sload--error" : ""}`}
      onPointerMove={(event) => {
        if (reducedMotion) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * 100 : 50;
        const y = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
        const driftX = Math.max(-14, Math.min(14, ((x - 50) / 50) * 14));
        const driftY = Math.max(-10, Math.min(10, ((y - 50) / 50) * 10));
        event.currentTarget.style.setProperty("--sload-drift-x", `${driftX.toFixed(2)}px`);
        event.currentTarget.style.setProperty("--sload-drift-y", `${driftY.toFixed(2)}px`);
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty("--sload-drift-x", "0px");
        event.currentTarget.style.setProperty("--sload-drift-y", "0px");
      }}
    >
      <div className="sload-backdrop" />
      {gameCover && (
        <img
          className="sload-backdrop-art"
          src={gameCover}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="eager"
          decoding="async"
        />
      )}
      <div className="sload-backdrop-mosaic" aria-hidden="true" />
      {!hasError && <LazyShaderAtmosphere variant={status === "queue" ? "queue" : "connecting"} />}
      <div className="sload-backdrop-wash" />

      <div className="sload-content">
        <div className="sload-game">
          <div className="sload-cover">
            {squareArtwork ? (
              <img
                src={squareArtwork}
                alt={`${gameTitle} logo`}
                className="sload-cover-img"
                loading="eager"
                decoding="sync"
                fetchPriority="high"
              />
            ) : (
              <div className="sload-cover-empty" aria-label={`${gameTitle} logo`}>
                <span className="sload-cover-initials">{artworkInitials}</span>
              </div>
            )}
          </div>
          <div className="sload-game-meta">
            <p className="sload-label">{hasError ? t("streamLoading.labels.launchError") : t("streamLoading.labels.nowLoading")}</p>
            <h2 className="sload-title" title={gameTitle}>{gameTitle}</h2>
            {PlatformIcon && (
              <div className="sload-platform" title={platformName}>
                <span className="sload-platform-icon"><PlatformIcon /></span>
                <span>{platformName}</span>
              </div>
            )}
          </div>
        </div>

        {!hasError && (
          <div className="sload-stage-rail" aria-label={t("streamLoading.labels.launchProgress")}>
            {launchStages.map((stage, index) => {
              const StageIcon = stage.icon;
              const state = index < activeStage ? "completed" : index === activeStage ? "active" : "pending";
              return (
                <div className={`sload-stage sload-stage--${state}`} key={stage.id}>
                  <m.span
                    className="sload-stage-icon"
                    animate={state === "active"
                      ? statusPulseMotion.animate
                      : { opacity: 1, scale: 1 }}
                    transition={state === "active"
                      ? statusPulseMotion.transition
                      : { duration: 0.2 }}
                  >
                    <StageIcon size={18} />
                  </m.span>
                  {index < launchStages.length - 1 && <span className="sload-stage-line" />}
                </div>
              );
            })}
          </div>
        )}

        <div className={`sload-status${hasError ? " sload-status--error" : ""}`}>
          {hasError ? (
            <XCircle size={24} className="sload-error-icon" />
          ) : (
            <m.span
              className="sload-live-dot"
              aria-hidden="true"
              animate={statusPulseMotion.animate}
              transition={statusPulseMotion.transition}
            />
          )}
          <div className="sload-status-text">
            <p className="sload-message" role="status" aria-live="polite">{statusMessage}</p>
            {!hasError && <p className="sload-detail">{getPhaseDetail(t, status)}</p>}
            {!hasError && status === "queue" && !hasQueuePosition && (
              <p className="sload-queue-sync" role="status" aria-live="polite">
                <span className="sload-queue-sync-dot" aria-hidden="true" />
                {t("streamLoading.status.syncingQueueDetail")}
              </p>
            )}
            {!hasError && status === "queue" && queueMovement > 0 && (
              <p className="sload-queue-progress">{t("streamLoading.telemetry.queueMoved", { count: queueMovement })}</p>
            )}
            {hasError && error && (
              <>
                <p className="sload-error-title">{error.title}</p>
                <p className="sload-error-desc">{error.description}</p>
                {error.code && <p className="sload-error-code">{error.code}</p>}
              </>
            )}
          </div>
        </div>

        {!hasError && (
          <div className="sload-facts">
            <div className="sload-fact">
              <p>{t("streamLoading.telemetry.queuePosition")}</p>
              <strong>{status === "queue" && hasQueuePosition ? `#${queuePosition}` : status === "queue" ? t("streamLoading.telemetry.syncing") : t("streamLoading.telemetry.cleared")}</strong>
            </div>
            <div className="sload-fact">
              <p>{t("streamLoading.telemetry.elapsed")}</p>
              <strong>{formatWaitTime(elapsedSeconds)}</strong>
            </div>
            <div className="sload-fact">
              <p>{t("streamLoading.cozy.next")}</p>
              <strong>{getNextStep(t, status)}</strong>
            </div>
          </div>
        )}

        {!hasError && activeAd && cachedAdMediaUrl && (
          <div className={`sload-ad${isSessionQueuePaused(adState) ? " sload-ad--paused" : ""}`}>
            <div className="sload-ad-copy">
              <span className="sload-ad-chip">{t("streamLoading.labels.adQueue")}</span>
              {adSummary && <p className="sload-ad-message">{adSummary}</p>}
            </div>
            <div className="sload-ad-media">
              <QueueAdPreview
                ref={adPreviewRef}
                mediaUrl={cachedAdMediaUrl}
                title={activeAd.title}
                onPlaybackEvent={(event) => onAdPlaybackEvent?.(event, activeAd.adId)}
              />
            </div>
          </div>
        )}

        {status === "queue" && !hasError && (estimatedWait || computedWaitLabel) && (
          <p className="sload-queue"><span className="sload-wait">{estimatedWait ?? computedWaitLabel}</span></p>
        )}

        <div className="sload-actions">
          {hasError && error?.actionLabel && onErrorAction && (
            <button className="sload-cancel sload-cancel--primary" onClick={onErrorAction}>
              <span>{error.actionLabel}</span>
            </button>
          )}
          <button className="sload-cancel" onClick={onCancel} aria-label={t("streamLoading.actions.cancelLoading")}>
            <X size={16} />
            <span>{hasError ? t("app.actions.close") : t("app.actions.cancel")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
