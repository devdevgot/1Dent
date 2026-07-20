import { createPortal } from "react-dom";
import type { PullToRefreshPhase } from "@/hooks/use-pwa-pull-to-refresh";

type PullToRefreshIndicatorProps = {
  pullY: number;
  /** Bottom Y of the revealed gap (top of the pulled page surface). */
  gapBottom?: number;
  phase: PullToRefreshPhase;
  threshold: number;
  visible: boolean;
};

const TICK_COUNT = 12;

/**
 * Instagram / iOS-style activity indicator in the rubber-band gap
 * above the pulled page/overlay — never drawn over search/title chrome.
 */
export function PullToRefreshIndicator({
  pullY,
  gapBottom,
  phase,
  threshold,
  visible,
}: PullToRefreshIndicatorProps) {
  if (!visible || typeof document === "undefined") return null;

  const fallbackGap = phase === "refreshing" ? threshold : pullY;
  // Prefer the measured surface top so the spinner tracks the real gap
  // (home chrome, service overlays, etc.).
  const gap = Math.max(fallbackGap, gapBottom ?? 0);
  const progress = Math.min(gap / threshold, 1);
  const spinning = phase === "refreshing";
  const pullRotate = spinning ? 0 : progress * 360;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex items-center justify-center"
      style={{
        height: Math.max(gap, 0),
        opacity: progress < 0.1 ? 0 : Math.min(1, progress * 1.15),
        transition:
          phase === "refreshing"
            ? "height 150ms ease-out, opacity 120ms ease-out"
            : "opacity 60ms linear",
      }}
      aria-live="polite"
      aria-busy={spinning}
      aria-label="Refreshing"
    >
      <div
        className={spinning ? "ptr-ios-spinner ptr-ios-spinner--spinning" : "ptr-ios-spinner"}
        style={spinning ? undefined : { transform: `rotate(${pullRotate}deg)` }}
      >
        {Array.from({ length: TICK_COUNT }, (_, i) => {
          const opacity = 0.18 + (i / (TICK_COUNT - 1)) * 0.82;
          return (
            <span
              key={i}
              className="ptr-ios-spinner__tick"
              style={{
                transform: `rotate(${(360 / TICK_COUNT) * i}deg)`,
                opacity,
              }}
            />
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
