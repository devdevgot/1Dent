import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PullToRefreshPhase } from "@/hooks/use-pwa-pull-to-refresh";

type PullToRefreshIndicatorProps = {
  pullY: number;
  phase: PullToRefreshPhase;
  threshold: number;
  visible: boolean;
};

/**
 * Spinner that sits only in the empty top gap created when the page surface
 * (header + content) is pulled down — never overlaid on the search chrome.
 */
export function PullToRefreshIndicator({
  pullY,
  phase,
  threshold,
  visible,
}: PullToRefreshIndicatorProps) {
  if (!visible || typeof document === "undefined") return null;

  const gap = phase === "refreshing" ? threshold : pullY;
  const progress = Math.min(gap / threshold, 1);

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex items-center justify-center"
      style={{
        // Match the rubber-band gap from the very top of the viewport (above search).
        height: Math.max(gap, 0),
        opacity: progress < 0.12 ? 0 : Math.min(1, progress),
        transition:
          phase === "refreshing"
            ? "height 150ms ease-out, opacity 120ms ease-out"
            : "opacity 80ms linear",
      }}
      aria-live="polite"
      aria-busy={phase === "refreshing"}
      aria-label="Refreshing"
    >
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
    </div>,
    document.body,
  );
}
