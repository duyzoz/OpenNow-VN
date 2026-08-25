import { useCallback, useEffect, useState } from "react";
import type { ClipboardEvent, JSX, KeyboardEvent } from "react";
import { normalizeShortcut, shortcutFromKeyboardEvent } from "../../../shortcuts";
import { getShortcutConflictError } from "../streamRuntimeHelpers";
import { useTranslation } from "../../../i18n";

export interface StreamShortcutBindings {
  toggleStats: string;
  togglePointerLock: string;
  toggleFullscreen: string;
  stopStream: string;
  toggleAntiAfk: string;
  toggleMicrophone?: string;
  screenshot: string;
  recording: string;
}

interface UseStreamQuickMenuShortcutsOptions {
  shortcuts: StreamShortcutBindings;
  isMacClient: boolean;
  onScreenshotShortcutChange: (value: string) => void;
  onRecordingShortcutChange: (value: string) => void;
}

export function useStreamQuickMenuShortcuts({
  shortcuts,
  isMacClient,
  onScreenshotShortcutChange,
  onRecordingShortcutChange,
}: UseStreamQuickMenuShortcutsOptions) {
  const { t } = useTranslation();
  const localizeShortcutError = useCallback((error: string | null): string | null => {
    if (error === "Shortcut cannot be empty.") return t("stream.errors.shortcutEmpty");
    if (error === "Invalid shortcut format.") return t("stream.errors.shortcutInvalid");
    if (error === "Shortcut conflicts with an existing binding.") return t("stream.errors.shortcutConflict");
    return error;
  }, [t]);
  const [screenshotShortcutInput, setScreenshotShortcutInput] = useState(shortcuts.screenshot);
  const [screenshotShortcutError, setScreenshotShortcutError] = useState<string | null>(null);
  const [recordingShortcutInput, setRecordingShortcutInput] = useState(shortcuts.recording);
  const [recordingShortcutError, setRecordingShortcutError] = useState<string | null>(null);

  useEffect(() => {
    setScreenshotShortcutInput(shortcuts.screenshot);
    setScreenshotShortcutError(null);
  }, [shortcuts.screenshot]);

  useEffect(() => {
    setRecordingShortcutInput(shortcuts.recording);
    setRecordingShortcutError(null);
  }, [shortcuts.recording]);

  const getScreenshotShortcutError = useCallback((rawValue: string): string | null => {
    return localizeShortcutError(getShortcutConflictError(rawValue, [
      shortcuts.toggleStats,
      shortcuts.togglePointerLock,
      shortcuts.stopStream,
      shortcuts.toggleAntiAfk,
      shortcuts.toggleMicrophone,
      shortcuts.recording,
      ...(isMacClient ? ["Meta+G"] : ["Ctrl+G", "Ctrl+Shift+G"]),
    ]));
  }, [
    isMacClient,
    shortcuts.recording,
    shortcuts.stopStream,
    shortcuts.toggleAntiAfk,
    shortcuts.toggleMicrophone,
    shortcuts.togglePointerLock,
    shortcuts.toggleStats,
    localizeShortcutError,
  ]);

  const getRecordingShortcutError = useCallback((rawValue: string): string | null => {
    return localizeShortcutError(getShortcutConflictError(rawValue, [
      shortcuts.toggleStats,
      shortcuts.togglePointerLock,
      shortcuts.stopStream,
      shortcuts.toggleAntiAfk,
      shortcuts.toggleMicrophone,
      shortcuts.screenshot,
      ...(isMacClient ? ["Meta+G"] : ["Ctrl+G", "Ctrl+Shift+G"]),
    ]));
  }, [
    isMacClient,
    shortcuts.screenshot,
    shortcuts.stopStream,
    shortcuts.toggleAntiAfk,
    shortcuts.toggleMicrophone,
    shortcuts.togglePointerLock,
    shortcuts.toggleStats,
    localizeShortcutError,
  ]);

  const applyScreenshotShortcutFromCapture = useCallback((canonical: string) => {
    const error = getScreenshotShortcutError(canonical);
    if (error) {
      setScreenshotShortcutError(error);
      return;
    }
    const normalized = normalizeShortcut(canonical.trim());
    if (!normalized.valid) {
      setScreenshotShortcutError(t("stream.quickMenu.shortcuts.invalidFormat"));
      return;
    }
    setScreenshotShortcutError(null);
    setScreenshotShortcutInput(normalized.canonical);
    if (normalized.canonical !== shortcuts.screenshot) {
      onScreenshotShortcutChange(normalized.canonical);
    }
  }, [getScreenshotShortcutError, onScreenshotShortcutChange, shortcuts.screenshot]);

  const applyRecordingShortcutFromCapture = useCallback((canonical: string) => {
    const error = getRecordingShortcutError(canonical);
    if (error) {
      setRecordingShortcutError(error);
      return;
    }
    const normalized = normalizeShortcut(canonical.trim());
    if (!normalized.valid) {
      setRecordingShortcutError(t("stream.quickMenu.shortcuts.invalidFormat"));
      return;
    }
    setRecordingShortcutError(null);
    setRecordingShortcutInput(normalized.canonical);
    if (normalized.canonical !== shortcuts.recording) {
      onRecordingShortcutChange(normalized.canonical);
    }
  }, [getRecordingShortcutError, onRecordingShortcutChange, shortcuts.recording]);

  const handleScreenshotShortcutKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      return;
    }
    const captured = shortcutFromKeyboardEvent(event.nativeEvent);
    if (!captured) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    applyScreenshotShortcutFromCapture(captured);
  };

  const handleRecordingShortcutKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      return;
    }
    const captured = shortcutFromKeyboardEvent(event.nativeEvent);
    if (!captured) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    applyRecordingShortcutFromCapture(captured);
  };

  const handleScreenshotShortcutPaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const text = event.clipboardData.getData("text/plain").trim();
    if (!text) {
      return;
    }
    event.preventDefault();
    applyScreenshotShortcutFromCapture(text);
  };

  const handleRecordingShortcutPaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const text = event.clipboardData.getData("text/plain").trim();
    if (!text) {
      return;
    }
    event.preventDefault();
    applyRecordingShortcutFromCapture(text);
  };

  return {
    screenshotShortcutInput,
    setScreenshotShortcutInput,
    screenshotShortcutError,
    setScreenshotShortcutError,
    recordingShortcutInput,
    setRecordingShortcutInput,
    recordingShortcutError,
    setRecordingShortcutError,
    getScreenshotShortcutError,
    getRecordingShortcutError,
    handleScreenshotShortcutKeyDown,
    handleRecordingShortcutKeyDown,
    handleScreenshotShortcutPaste,
    handleRecordingShortcutPaste,
  };
}

interface StreamQuickMenuShortcutsPageProps extends UseStreamQuickMenuShortcutsOptions {
  sidebarToggleShortcutDisplay: string;
  controllerSidebarShortcutDisplay: string;
  editor: ReturnType<typeof useStreamQuickMenuShortcuts>;
}

export function StreamQuickMenuShortcutsPage({
  shortcuts,
  sidebarToggleShortcutDisplay,
  controllerSidebarShortcutDisplay,
  onScreenshotShortcutChange,
  onRecordingShortcutChange,
  editor,
}: StreamQuickMenuShortcutsPageProps): JSX.Element {
  const {
    screenshotShortcutInput,
    setScreenshotShortcutInput,
    screenshotShortcutError,
    setScreenshotShortcutError,
    recordingShortcutInput,
    setRecordingShortcutInput,
    recordingShortcutError,
    setRecordingShortcutError,
    getScreenshotShortcutError,
    getRecordingShortcutError,
    handleScreenshotShortcutKeyDown,
    handleRecordingShortcutKeyDown,
    handleScreenshotShortcutPaste,
    handleRecordingShortcutPaste,
  } = editor;
  const { t } = useTranslation();

  return (
    <div className="sidebar-page" role="tabpanel">
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <span>{t("stream.quickMenu.shortcuts.title")}</span>
          <span className="sidebar-section-sub">{t("stream.quickMenu.shortcuts.subtitle")}</span>
        </div>
        <div className="sidebar-row sidebar-row--column">
          <div className="sidebar-row-top">
            <span className="sidebar-label">{t("stream.quickMenu.shortcuts.screenshot")}</span>
          </div>
          <input
            type="text"
            name="screenshot-shortcut"
            aria-label={t("stream.quickMenu.shortcuts.aria")}
            className={`settings-text-input settings-shortcut-input sidebar-shortcut-input ${screenshotShortcutError ? "error" : ""}`}
            value={screenshotShortcutInput}
            readOnly
            onFocus={(event) => event.target.select()}
            onPaste={handleScreenshotShortcutPaste}
            onBlur={() => {
              const error = getScreenshotShortcutError(screenshotShortcutInput);
              if (error) {
                setScreenshotShortcutError(error);
                return;
              }
              const normalized = normalizeShortcut(screenshotShortcutInput.trim());
              if (!normalized.valid) {
                setScreenshotShortcutError(t("stream.quickMenu.shortcuts.invalidFormat"));
                return;
              }
              setScreenshotShortcutError(null);
              setScreenshotShortcutInput(normalized.canonical);
              if (normalized.canonical !== shortcuts.screenshot) {
                onScreenshotShortcutChange(normalized.canonical);
              }
            }}
            onKeyDown={handleScreenshotShortcutKeyDown}
            placeholder={t("stream.quickMenu.shortcuts.capturePlaceholder")}
            title={t("stream.quickMenu.shortcuts.captureTitle")}
            spellCheck={false}
          />
        </div>
        {screenshotShortcutError && (
          <span className="sidebar-hint sidebar-hint--error">{screenshotShortcutError}</span>
        )}
        <div className="sidebar-row sidebar-row--column">
          <div className="sidebar-row-top">
            <span className="sidebar-label">{t("stream.quickMenu.shortcuts.recording")}</span>
          </div>
          <input
            type="text"
            name="recording-shortcut"
            aria-label={t("stream.quickMenu.shortcuts.recordingAria")}
            className={`settings-text-input settings-shortcut-input sidebar-shortcut-input ${recordingShortcutError ? "error" : ""}`}
            value={recordingShortcutInput}
            readOnly
            onFocus={(event) => event.target.select()}
            onPaste={handleRecordingShortcutPaste}
            onBlur={() => {
              const error = getRecordingShortcutError(recordingShortcutInput);
              if (error) {
                setRecordingShortcutError(error);
                return;
              }
              const normalized = normalizeShortcut(recordingShortcutInput.trim());
              if (!normalized.valid) {
                setRecordingShortcutError(t("stream.quickMenu.shortcuts.invalidFormat"));
                return;
              }
              setRecordingShortcutError(null);
              setRecordingShortcutInput(normalized.canonical);
              if (normalized.canonical !== shortcuts.recording) {
                onRecordingShortcutChange(normalized.canonical);
              }
            }}
            onKeyDown={handleRecordingShortcutKeyDown}
            placeholder={t("stream.quickMenu.shortcuts.capturePlaceholder")}
            title={t("stream.quickMenu.shortcuts.captureTitle")}
            spellCheck={false}
          />
        </div>
        {recordingShortcutError && (
          <span className="sidebar-hint sidebar-hint--error">{recordingShortcutError}</span>
        )}
        <div className="sidebar-row sidebar-row--aligned">
          <span className="sidebar-label">{t("stream.quickMenu.shortcuts.toggleStats")}</span>
          <span className="settings-value-badge">{shortcuts.toggleStats}</span>
        </div>
        <div className="sidebar-row sidebar-row--aligned">
          <span className="sidebar-label">{t("stream.quickMenu.shortcuts.mouseLock")}</span>
          <span className="settings-value-badge">{shortcuts.togglePointerLock}</span>
        </div>
        <div className="sidebar-row sidebar-row--aligned">
          <span className="sidebar-label">{t("stream.quickMenu.shortcuts.stopStream")}</span>
          <span className="settings-value-badge">{shortcuts.stopStream}</span>
        </div>
        {shortcuts.toggleMicrophone && (
          <div className="sidebar-row sidebar-row--aligned">
            <span className="sidebar-label">{t("stream.quickMenu.shortcuts.toggleMicrophone")}</span>
            <span className="settings-value-badge">{shortcuts.toggleMicrophone}</span>
          </div>
        )}
        <div className="sidebar-row sidebar-row--aligned">
          <span className="sidebar-label">{t("stream.quickMenu.shortcuts.toggleSidebar")}</span>
          <span className="sidebar-shortcut-stack">
            <span className="settings-value-badge">{sidebarToggleShortcutDisplay}</span>
            <span className="settings-value-badge">{controllerSidebarShortcutDisplay}</span>
          </span>
        </div>
      </section>
    </div>
  );
}
