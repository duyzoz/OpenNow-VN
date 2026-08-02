import { useEffect, useState, type JSX } from "react";
import { Cpu, Sparkles, Zap } from "lucide-react";

import { useTranslation } from "../i18n";
import { detectLowEndDevice, setPerfMode, type PerfMode } from "../lib/perfMode";

/**
 * First-run performance profile picker.
 *
 * Deliberately NOT animated with motion/react: this is the very first thing that
 * paints, so the whole point is that it costs nothing. It uses a plain CSS fade
 * that the low-perf stylesheet can disable outright.
 */

const PROMPT_SEEN_KEY = "opennow_perf_prompt_seen_v1";

function hasSeenPrompt(): boolean {
  try {
    return localStorage.getItem(PROMPT_SEEN_KEY) === "1";
  } catch {
    return true; // storage unavailable -> never nag
  }
}

function markPromptSeen(): void {
  try {
    localStorage.setItem(PROMPT_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Lets Settings offer a "show the profile picker again" affordance. */
export function resetPerfModePrompt(): void {
  try {
    localStorage.removeItem(PROMPT_SEEN_KEY);
  } catch {
    /* ignore */
  }
}

export function PerfModePrompt(): JSX.Element | null {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [suggestedLow, setSuggestedLow] = useState(false);

  useEffect(() => {
    if (hasSeenPrompt()) return;
    // Defer one idle tick so the prompt never competes with first paint.
    const show = () => {
      setSuggestedLow(detectLowEndDevice());
      setOpen(true);
    };
    const idle = window.requestIdleCallback?.(show, { timeout: 900 });
    const fallback = idle === undefined ? window.setTimeout(show, 400) : undefined;
    return () => {
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      if (fallback !== undefined) window.clearTimeout(fallback);
    };
  }, []);

  if (!open) return null;

  const choose = (mode: PerfMode) => {
    setPerfMode(mode);
    markPromptSeen();
    setOpen(false);
  };

  return (
    <div className="perf-prompt-backdrop" role="dialog" aria-modal="true">
      <div className="perf-prompt-card">
        <div className="perf-prompt-head">
          <Cpu size={18} />
          <h2>{t("perf.promptTitle")}</h2>
        </div>
        <p className="perf-prompt-body">{t("perf.promptBody")}</p>

        <div className="perf-prompt-options">
          <button
            type="button"
            className={`perf-prompt-option${suggestedLow ? " perf-prompt-option--suggested" : ""}`}
            onClick={() => choose("low")}
          >
            <Zap size={20} />
            <span className="perf-prompt-option-title">{t("perf.promptLow")}</span>
            <span className="perf-prompt-option-desc">{t("perf.promptLowBody")}</span>
          </button>

          <button
            type="button"
            className={`perf-prompt-option${suggestedLow ? "" : " perf-prompt-option--suggested"}`}
            onClick={() => choose("high")}
          >
            <Sparkles size={20} />
            <span className="perf-prompt-option-title">{t("perf.promptHigh")}</span>
            <span className="perf-prompt-option-desc">{t("perf.promptHighBody")}</span>
          </button>
        </div>

        <button type="button" className="perf-prompt-skip" onClick={() => choose("auto")}>
          {t("perf.auto")} — {t("perf.autoHint")}
        </button>
      </div>
    </div>
  );
}

export default PerfModePrompt;
