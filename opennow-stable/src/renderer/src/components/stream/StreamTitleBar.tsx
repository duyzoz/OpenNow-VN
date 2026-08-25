import type { JSX } from "react";
import type { StreamDiagnosticsStore } from "../../utils/streamDiagnosticsStore";
import { useTranslation } from "../../i18n";
import { useStreamDiagnosticsSelector } from "../../utils/streamDiagnosticsStore";

export function StreamTitleBar({
  diagnosticsStore,
  gameTitle,
  platformName,
  PlatformIcon,
  showHints,
  antiAfkEnabled,
}: {
  diagnosticsStore: StreamDiagnosticsStore;
  gameTitle: string;
  platformName: string;
  PlatformIcon: (() => JSX.Element) | null;
  showHints: boolean;
  antiAfkEnabled: boolean;
}): JSX.Element | null {
  const { t } = useTranslation();
  const hasResolution = useStreamDiagnosticsSelector(
    diagnosticsStore,
    (stats) => stats.nativeRendererActive || stats.resolution !== "",
  );

  if (!hasResolution || !showHints) {
    return null;
  }

  return (
    <div className="sv-title-bar">
      <span className="sv-title-game">{gameTitle}</span>
      <span className={`sv-title-afk${antiAfkEnabled ? " sv-title-afk--on" : " sv-title-afk--off"}`}>
        <span className="sv-title-afk-dot" aria-hidden />
        {antiAfkEnabled ? t("stream.view.afkOnShort") : t("stream.view.afkOffShort")}
      </span>
      {PlatformIcon && (
        <span className="sv-title-platform" title={platformName}>
          <span className="sv-title-platform-icon">
            <PlatformIcon />
          </span>
          <span>{platformName}</span>
        </span>
      )}
    </div>
  );
}
