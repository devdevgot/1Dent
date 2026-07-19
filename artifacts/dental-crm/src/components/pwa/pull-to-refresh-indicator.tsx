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

export function PullToRefreshIndicator({
  pullY,
  phase,
  threshold,
  visible,
}: PullToRefreshIndicatorProps) {
  const { t } = useTranslation();

  if (!visible || typeof document === "undefined") return null;

  const progress = Math.min(pullY / threshold, 1);
  const label =
    phase === "refreshing"
      ? t("pwa.pullRefreshing")
      : phase === "release"
        ? t("pwa.pullRelease")
        : t("pwa.pullHint");

  const offsetY = phase === "refreshing" ? threshold : pullY;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[120] flex justify-center"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 6px)",
        transform: `translateY(${Math.max(0, offsetY - 28)}px)`,
        opacity: Math.max(0.35, progress),
        transition: phase === "refreshing" ? "transform 150ms ease-out" : "opacity 120ms ease-out",
      }}
      aria-live="polite"
      aria-busy={phase === "refreshing"}
    >
      <div className="flex items-center gap-2 rounded-full border border-[#e8e3d9] bg-white/95 px-3 py-1.5 shadow-md backdrop-blur-sm">
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
        <span className="text-[11px] font-medium text-[#64748b]">{label}</span>
      </div>
    </div>,
    document.body,
  );
}
