import { useCallback, useEffect, useRef, useState } from "react";
import { isPwaStandalone } from "@/lib/pwa";

const THRESHOLD = 72;
const MAX_PULL = 120;
const RUBBER = 0.38;
/** Ignore tiny finger jitter before deciding this is a page pull. */
const ARM_DY = 14;
/** Abort if the gesture is mostly horizontal (day swipe, etc.). */
const VERTICAL_RATIO = 1.35;

export type PullToRefreshPhase = "idle" | "pulling" | "release" | "refreshing";

type Options = {
  onRefresh: () => Promise<void>;
  /** Defaults to PWA standalone only. */
  enabled?: boolean;
};

function canScroll(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight + 1;
}

/** Nearest ancestor (or self) that actually scrolls vertically. */
function getScrollParent(start: EventTarget | null): HTMLElement | null {
  let node = start instanceof HTMLElement ? start : null;
  while (node && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      canScroll(node)
    ) {
      return node;
    }
    node = node.parentElement;
  }
  const root = document.scrollingElement;
  return root instanceof HTMLElement ? root : null;
}

/**
 * Element that rubber-bands during PTR. Prefer a layout surface that includes
 * sticky headers (search chrome / overlay title), so the spinner gap opens
 * above the whole page — not over the chrome.
 */
function getPullSurface(scrollEl: HTMLElement): HTMLElement {
  const surface = scrollEl.closest("[data-ptr-surface]");
  return surface instanceof HTMLElement ? surface : scrollEl;
}

function isPtrIgnored(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-ptr-ignore]"));
}

function clearPullVisual(el: HTMLElement | null) {
  if (!el) return;
  el.style.transform = "";
  el.style.transition = "";
  el.style.willChange = "";
  el.removeAttribute("data-ptr-pulling");
}

function applyPullVisual(el: HTMLElement, pullY: number, animated: boolean) {
  el.style.willChange = "transform";
  el.style.transition = animated ? "transform 180ms ease-out" : "none";
  el.style.transform = pullY > 0 ? `translate3d(0, ${pullY}px, 0)` : "";
  if (pullY > 0) el.setAttribute("data-ptr-pulling", "true");
  else el.removeAttribute("data-ptr-pulling");
}

/**
 * Native-style page pull-to-refresh.
 *
 * - Only engages when the scroll container is at the very top
 * - Only after a clear vertical pull (not horizontal swipes / drag gestures)
 * - Skips surfaces marked with `data-ptr-ignore` (e.g. schedule timeline drag)
 * - Moves the page surface (header + content) so empty space appears at the top for the spinner
 */
export function usePwaPullToRefresh({
  onRefresh,
  enabled = isPwaStandalone(),
}: Options) {
  const [pullY, setPullY] = useState(0);
  const [phase, setPhase] = useState<PullToRefreshPhase>("idle");
  /** Bottom of the revealed gap (= top edge of the pulled surface). */
  const [gapBottom, setGapBottom] = useState(0);

  const armedRef = useRef(false);
  const engagedRef = useRef(false);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const surfaceElRef = useRef<HTMLElement | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const refreshingRef = useRef(false);
  const pullYRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const syncGap = useCallback((el: HTMLElement | null, fallback: number) => {
    if (!el) {
      setGapBottom(fallback);
      return;
    }
    // After translateY, the surface's top is the bottom of the spinner gap.
    const top = el.getBoundingClientRect().top;
    setGapBottom(Math.max(fallback, top));
  }, []);

  const reset = useCallback((animated = false) => {
    const el = surfaceElRef.current;
    if (el) {
      if (animated && pullYRef.current > 0) {
        applyPullVisual(el, 0, true);
        window.setTimeout(() => clearPullVisual(el), 200);
      } else {
        clearPullVisual(el);
      }
    }
    armedRef.current = false;
    engagedRef.current = false;
    scrollElRef.current = null;
    surfaceElRef.current = null;
    pullYRef.current = 0;
    setPullY(0);
    setGapBottom(0);
    setPhase("idle");
  }, []);

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    const el = surfaceElRef.current;
    setPhase("refreshing");
    setPullY(THRESHOLD);
    pullYRef.current = THRESHOLD;
    if (el) {
      applyPullVisual(el, THRESHOLD, true);
      // Measure after the animated transform starts.
      window.requestAnimationFrame(() => syncGap(el, THRESHOLD));
    } else {
      setGapBottom(THRESHOLD);
    }

    try {
      await onRefreshRef.current();
    } finally {
      refreshingRef.current = false;
      reset(true);
    }
  }, [reset, syncGap]);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return;
      if (isPtrIgnored(e.target)) return;

      const scrollEl = getScrollParent(e.target);
      if (!scrollEl || scrollEl.scrollTop > 0.5) return;

      // Arm only — do not engage yet (avoids fighting long-press / day swipe).
      armedRef.current = true;
      engagedRef.current = false;
      scrollElRef.current = scrollEl;
      surfaceElRef.current = getPullSurface(scrollEl);
      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      pullYRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!armedRef.current || refreshingRef.current) return;
      const scrollEl = scrollElRef.current;
      const surfaceEl = surfaceElRef.current;
      if (!scrollEl || !surfaceEl) return;

      // If the gesture moved onto an ignored surface and we never engaged, abort.
      if (!engagedRef.current && isPtrIgnored(e.target)) {
        reset();
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - startXRef.current;
      const dy = touch.clientY - startYRef.current;

      if (!engagedRef.current) {
        // Still deciding whether this is a page pull.
        if (Math.abs(dx) > ARM_DY && Math.abs(dx) > Math.abs(dy) * VERTICAL_RATIO) {
          // Horizontal swipe (e.g. change day) — leave it alone.
          reset();
          return;
        }
        if (dy < ARM_DY) {
          if (dy < -4) reset(); // scrolling up / content starts moving
          return;
        }
        if (scrollEl.scrollTop > 0.5) {
          reset();
          return;
        }
        // Clear vertical pull from the top → engage page PTR.
        engagedRef.current = true;
        setPhase("pulling");
      }

      if (dy <= 0 || scrollEl.scrollTop > 0.5) {
        applyPullVisual(surfaceEl, 0, false);
        pullYRef.current = 0;
        setPullY(0);
        setGapBottom(0);
        setPhase("pulling");
        return;
      }

      // Own the gesture so the page rubber-bands instead of overscrolling.
      e.preventDefault();
      const next = Math.min(dy * RUBBER, MAX_PULL);
      pullYRef.current = next;
      setPullY(next);
      setPhase(next >= THRESHOLD ? "release" : "pulling");
      applyPullVisual(surfaceEl, next, false);
      syncGap(surfaceEl, next);
    };

    const onTouchEnd = () => {
      if (!armedRef.current || refreshingRef.current) return;
      if (!engagedRef.current) {
        reset();
        return;
      }
      armedRef.current = false;
      engagedRef.current = false;
      if (pullYRef.current >= THRESHOLD) {
        void runRefresh();
        return;
      }
      reset(true);
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      clearPullVisual(surfaceElRef.current);
    };
  }, [enabled, reset, runRefresh, syncGap]);

  return {
    pullY,
    gapBottom,
    phase,
    threshold: THRESHOLD,
    visible: phase !== "idle",
  };
}
