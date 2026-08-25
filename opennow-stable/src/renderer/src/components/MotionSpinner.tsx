import { Loader2 } from "lucide-react";
import { m } from "motion/react";
import type { JSX } from "react";
import { spinnerTransition } from "./MotionProvider";
import { useTranslation } from "../i18n";

interface MotionSpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export function MotionSpinner({
  size = 20,
  className,
  label,
}: MotionSpinnerProps): JSX.Element {
  const { t } = useTranslation();
  const spinnerLabel = label ?? t("common.loading");
  return (
    <m.span
      className={["motion-spinner", className].filter(Boolean).join(" ")}
      animate={{ rotate: 360 }}
      transition={spinnerTransition}
      role="status"
      aria-label={spinnerLabel}
    >
      <Loader2 size={size} aria-hidden="true" />
    </m.span>
  );
}
