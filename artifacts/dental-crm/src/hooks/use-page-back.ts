import { useCallback } from "react";
import { useLocation } from "wouter";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";

type UsePageBackOptions = {
  /** When not in overlay, navigate to /menu instead of history.back(). */
  menuFallback?: boolean;
};

export function usePageBack(options?: UsePageBackOptions) {
  const { isOverlay, dismiss } = useOverlayNavigation();
  const [, navigate] = useLocation();

  return useCallback(() => {
    if (isOverlay) {
      dismiss();
      return;
    }
    if (options?.menuFallback) {
      navigate("/menu");
      return;
    }
    window.history.back();
  }, [isOverlay, dismiss, navigate, options?.menuFallback]);
}
