import { useCallback, useEffect, useRef, useState } from "react";
import { isPwaStandalone } from "@/lib/pwa";

const THRESHOLD = 64;
const MAX_PULL = 96;
const RUBBER = 0.42;

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

export function usePwaPullToRefresh({
  onRefresh,
  enabled = isPwaStandalone(),
}: Options) {
  const [pullY, setPullY] = useState(0);
  const [phase, setPhase] = useState<PullToRefreshPhase>("idle");

  const trackingRef = useRef(false);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const startYRef = useRef(0);
  const refreshingRef = useRef(false);
  const pullYRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const reset = useCallback(() => {
    trackingRef.current = false;
    scrollElRef.current = null;
    pullYRef.current = 0;
    setPullY(0);
    setPhase("idle");
  }, []);

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setPhase("refreshing");
    setPullY(THRESHOLD);
    pullYRef.current = THRESHOLD;
    try {
      await onRefreshRef.current();
    } finally {
      refreshingRef.current = false;
      reset();
    }
  }, [reset]);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return;

      const scrollEl = getScrollParent(e.target);
      if (!scrollEl || scrollEl.scrollTop > 1) return;

      scrollElRef.current = scrollEl;
      trackingRef.current = true;
      startYRef.current = e.touches[0].clientY;
      setPhase("pulling");
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current || refreshingRef.current) return;
      const scrollEl = scrollElRef.current;
      if (!scrollEl) return;

      const dy = e.touches[0].clientY - startYRef.current;

      if (dy <= 0) {
        pullYRef.current = 0;
        setPullY(0);
        setPhase("pulling");
        return;
      }

      if (scrollEl.scrollTop > 1) {
        reset();
        return;
      }

      e.preventDefault();
      const next = Math.min(dy * RUBBER, MAX_PULL);
      pullYRef.current = next;
      setPullY(next);
      setPhase(next >= THRESHOLD ? "release" : "pulling");
    };

    const onTouchEnd = () => {
      if (!trackingRef.current || refreshingRef.current) return;
      trackingRef.current = false;
      scrollElRef.current = null;
      if (pullYRef.current >= THRESHOLD) {
        void runRefresh();
        return;
      }
      reset();
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
    };
  }, [enabled, reset, runRefresh]);

  return {
    pullY,
    phase,
    threshold: THRESHOLD,
    visible: phase !== "idle",
  };
}
