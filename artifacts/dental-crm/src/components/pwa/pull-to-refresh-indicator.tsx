import { createPortal } from "react-dom";
import type { PullToRefreshPhase } from "@/hooks/use-pwa-pull-to-refresh";

type PullToRefreshIndicatorProps = {
  pullY: number;
  phase: PullToRefreshPhase;
  threshold: number;
  visible: boolean;
};

const TICK_COUNT = 12;

/**
 * Instagram / iOS-style activity indicator: grey radial ticks in the
 * rubber-band gap above the page (no card, no blue Loader icon).
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
  const spinning = phase === "refreshing";
  // While pulling, rotate the tick “head” with progress so it feels alive.
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
          // Fade trail around the circle (brightest tick leads).
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
