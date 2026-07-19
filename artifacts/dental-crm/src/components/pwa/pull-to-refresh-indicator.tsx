import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { PullToRefreshPhase } from "@/hooks/use-pwa-pull-to-refresh";

type PullToRefreshIndicatorProps = {
  pullY: number;
  phase: PullToRefreshPhase;
  threshold: number;
  visible: boolean;
};

/**
 * Spinner that sits in the empty gap created when the page is pulled down.
 */
export function PullToRefreshIndicator({
  pullY,
  phase,
  threshold,
  visible,
}: PullToRefreshIndicatorProps) {
  const { t } = useTranslation();

  if (!visible || typeof document === "undefined") return null;

  const gap = phase === "refreshing" ? threshold : pullY;
  const progress = Math.min(gap / threshold, 1);
  const label =
    phase === "refreshing"
      ? t("pwa.pullRefreshing")
      : phase === "release"
        ? t("pwa.pullRelease")
        : t("pwa.pullHint");

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[120] flex items-center justify-center"
      style={{
        top: "env(safe-area-inset-top, 0px)",
        height: Math.max(gap, 0),
        opacity: progress < 0.15 ? 0 : Math.min(1, progress),
        transition: phase === "refreshing" ? "height 150ms ease-out, opacity 120ms ease-out" : "opacity 80ms linear",
      }}
      aria-live="polite"
      aria-busy={phase === "refreshing"}
    >
      <div className="flex flex-col items-center gap-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e8e3d9] bg-white/95 shadow-md backdrop-blur-sm">
          <Loader2
            className={cn(
              "h-4 w-4 text-[#1f75fe]",
              phase === "refreshing" && "animate-spin",
            )}
            style={
              phase !== "refreshing"
                ? { transform: `rotate(${progress * 300}deg)` }
                : undefined
            }
          />
        </div>
        {progress > 0.55 && (
          <span className="text-[10px] font-medium text-[#64748b]">{label}</span>
        )}
      </div>
    </div>,
    document.body,
  );
}
