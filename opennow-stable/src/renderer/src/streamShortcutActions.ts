const STREAM_SHORTCUT_ACTION_EVENT = "opennow:stream-shortcut-action";

export type StreamShortcutAction =
  | "toggleStats"
  | "togglePointerLock"
  | "toggleFullscreen"
  | "stopStream"
  | "toggleAntiAfk"
  | "toggleMicrophone"
  | "screenshot"
  | "toggleRecording"
  | "toggleSidebar";

export function dispatchStreamShortcutAction(action: StreamShortcutAction): void {
  window.dispatchEvent(new CustomEvent<StreamShortcutAction>(STREAM_SHORTCUT_ACTION_EVENT, {
    detail: action,
  }));
}

export function addStreamShortcutActionListener(
  listener: (action: StreamShortcutAction) => void,
): () => void {
  const handler: EventListener = (event) => {
    listener((event as CustomEvent<StreamShortcutAction>).detail);
  };

  window.addEventListener(STREAM_SHORTCUT_ACTION_EVENT, handler);
  return () => {
    window.removeEventListener(STREAM_SHORTCUT_ACTION_EVENT, handler);
  };
}
