import React from "react";
import ReactDOM from "react-dom/client";

import { initLogCapture } from "@shared/logger";
import { App } from "./App";
import { MotionProvider } from "./components/MotionProvider";
import { initializeLocale } from "./i18n";
import { applyPerfMode } from "./lib/perfMode";
import "./styles.css";

// Initialize log capture for renderer process
initLogCapture("renderer");
void initializeLocale();

// PERF: decide the render budget before React mounts so the very first paint
// already has the right effect level (no flash of heavy effects on weak PCs).
applyPerfMode();

// PERF: react-scan is a devtool. It was previously imported at module scope,
// which pulled its whole instrumentation bundle into the production build and
// kept a render-profiling hook attached to every commit. Now it is dynamically
// imported in dev only, so production ships zero react-scan code.
if (import.meta.env.DEV) {
  void import("react-scan").then(({ scan }) => scan()).catch(() => {
    /* devtool is optional */
  });
}

const rootElement = document.getElementById("root") as HTMLElement;
const tree = (
  <MotionProvider>
    <App />
  </MotionProvider>
);

// PERF: StrictMode double-invokes every render and effect. That is valuable in
// development but it literally doubles the mount cost of a 900-card catalog,
// so production mounts the tree once.
ReactDOM.createRoot(rootElement).render(
  import.meta.env.DEV ? <React.StrictMode>{tree}</React.StrictMode> : tree,
);
