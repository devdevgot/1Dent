import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { isPwaStandalone } from "@/lib/pwa";

const THRESHOLD = 64;
const MAX_PULL = 96;
const RUBBER = 0.42;

export type PullToRefreshPhase = "idle" | "pulling" | "release" | "refreshing";

type Options = {
  scrollRef: RefObject<HTMLElement | null>;
  onRefresh: () => Promise<void>;
  /** Defaults to PWA standalone only. */
  enabled?: boolean;
};

export function usePwaPullToRefresh({
  scrollRef,
  onRefresh,
  enabled = isPwaStandalone(),
}: Options) {
  const [pullY, setPullY] = useState(0);
  const [phase, setPhase] = useState<PullToRefreshPhase>("idle");

  const trackingRef = useRef(false);
  const startYRef = useRef(0);
  const refreshingRef = useRef(false);
  const pullYRef = useRef(0);

  const reset = useCallback(() => {
    trackingRef.current = false;
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
      await onRefresh();
    } finally {
      refreshingRef.current = false;
      reset();
    }
  }, [onRefresh, reset]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return;
      if (el.scrollTop > 1) return;
      trackingRef.current = true;
      startYRef.current = e.touches[0].clientY;
      setPhase("pulling");
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startYRef.current;

      if (dy <= 0) {
        pullYRef.current = 0;
        setPullY(0);
        setPhase("pulling");
        return;
      }

      if (el.scrollTop > 1) {
        trackingRef.current = false;
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
      if (pullYRef.current >= THRESHOLD) {
        void runRefresh();
        return;
      }
      reset();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [scrollRef, enabled, reset, runRefresh]);

  const visible = phase !== "idle";

  return {
    pullY,
    phase,
    threshold: THRESHOLD,
    visible,
  };
}
