import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { Calendar, Clock3, Clock } from "lucide-react";

import type { SubscriptionInfo } from "@shared/gfn";

import { useTranslation } from "../i18n";
import { formatElapsed } from "../utils/timeFormat";
import { formatRemainingPlaytimeFromSubscription } from "../utils/usePlaytime";

interface SessionElapsedIndicatorProps {
  startedAtMs: number | null;
  active: boolean;
  className?: string;
  iconSize?: number;
  timeRemainingSeconds?: number | null;
}

export function SessionElapsedIndicator({ startedAtMs, active, className, iconSize = 14, timeRemainingSeconds }: SessionElapsedIndicatorProps): JSX.Element {
  const { t } = useTranslation();
  const timeRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  
  useEffect(() => {
    if (!active || startedAtMs == null) return;
    
    let frame: number;
    let lastPing = 0;
    
    const update = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      
      if (timeRef.current) {
        timeRef.current.textContent = formatElapsed(elapsedSeconds);
      }
      
      if (ringRef.current) {
        const strokeDashoffset = 100 - (elapsedSeconds % 60) * (100 / 60);
        ringRef.current.style.strokeDashoffset = String(strokeDashoffset);
        
        if (timeRemainingSeconds != null) {
          if (timeRemainingSeconds <= 5 * 60) {
            ringRef.current.style.stroke = "var(--error)";
            ringRef.current.classList.add("session-ring-pulse");
            // Basic ping sound throttling
            const now = Date.now();
            if (now - lastPing > 60000) { // every minute when < 5 mins
               lastPing = now;
               // Note: actual ping sound could be played here if audio context allows
            }
          } else if (timeRemainingSeconds <= 15 * 60) {
            ringRef.current.style.stroke = "var(--warning)";
            ringRef.current.classList.remove("session-ring-pulse");
          } else {
            ringRef.current.style.stroke = "var(--accent)";
            ringRef.current.classList.remove("session-ring-pulse");
          }
        } else {
          // Fallback if no remaining time provided
          ringRef.current.style.stroke = "var(--accent)";
        }
      }
      
      frame = window.requestAnimationFrame(update);
    };
    
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [active, startedAtMs, timeRemainingSeconds]);

  return (
    <span className={`${className} session-elapsed-ring`}>
      <svg width={iconSize * 1.5} height={iconSize * 1.5} viewBox="0 0 36 36" className="circular-chart">
        <path className="circle-bg"
          d="M18 2.0845
            a 15.9155 15.9155 0 0 1 0 31.831
            a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path className="circle"
          ref={ringRef}
          strokeDasharray="100, 100"
          d="M18 2.0845
            a 15.9155 15.9155 0 0 1 0 31.831
            a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <span ref={timeRef}>{active ? formatElapsed(0) : "00:00:00"}</span>
    </span>
  );
}


interface CurrentClockProps {
  className?: string;
}

function useTicker(tickMs: number): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [tickMs]);

  return nowMs;
}

export function CurrentClock({ className }: CurrentClockProps): JSX.Element {
  const nowMs = useTicker(1000);
  return (
    <span className={className}>
      <Clock size={16} />
      <span>{new Date(nowMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </span>
  );
}

interface RemainingPlaytimeIndicatorProps {
  subscriptionInfo: SubscriptionInfo | null;
  startedAtMs: number | null;
  active: boolean;
  className?: string;
}

export function RemainingPlaytimeIndicator({ subscriptionInfo, startedAtMs, active, className }: RemainingPlaytimeIndicatorProps): JSX.Element {
  const { t } = useTranslation();
  const nowMs = useTicker(60_000);
  const elapsedSeconds = active && startedAtMs != null ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000)) : 0;
  const consumedHours = active ? Math.floor(elapsedSeconds / 60) / 60 : 0;
  const remainingPlaytimeText = formatRemainingPlaytimeFromSubscription(subscriptionInfo, consumedHours);

  return (
    <span className={className}>
      <Calendar size={10} />
      <span>{t("session.remainingPlaytime", { value: remainingPlaytimeText })}</span>
    </span>
  );
}
