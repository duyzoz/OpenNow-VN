import type { ExistingSessionStrategy, StreamSettings } from "@shared/gfn";
import {
  normalizeCloudGsyncOverride,
  resolveCloudGsync,
} from "@shared/cloudGsync";

export function shouldForceNewSession(
  strategy: ExistingSessionStrategy | undefined,
): boolean {
  return strategy === "force-new";
}

export async function resolveSessionCloudGsyncSettings(
  settings: StreamSettings,
): Promise<StreamSettings> {
  const userRequested = settings.enableCloudGsync;
  const clientMode = "web" as const;
  const capabilities = undefined;
  const resolution = resolveCloudGsync({
    userRequested,
    fps: settings.fps,
    clientMode,
    nativeBackendAvailable: false,
    capabilities,
    override: normalizeCloudGsyncOverride("auto"),
  });

  console.log(
    `[CloudGsync] requested=${resolution.requested} resolved=${resolution.enabled} reflex=${resolution.reflexEnabled} reason=${resolution.reason} clientMode=${clientMode} fps=${settings.fps} capabilities=${JSON.stringify(resolution.capabilities)}`,
  );

  if (resolution.enabled) {
    console.log(
      "[CloudGsync] Cloud G-Sync/VRR mode is resolved on; keeping low-latency unthrottled presentation.",
    );
  }

  return {
    ...settings,
    requestedCloudGsync: userRequested,
    enableCloudGsync: resolution.enabled,
    cloudGsyncResolution: resolution,
  };
}
