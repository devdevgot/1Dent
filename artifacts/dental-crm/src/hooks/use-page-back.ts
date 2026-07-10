import { useCallback } from "react";
import { useLocation } from "wouter";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";

type UsePageBackOptions = {
  menuFallback?: boolean;
};

export function usePageBack(options?: UsePageBackOptions) {
  const { isOverlay, popStack, dismiss } = useOverlayNavigation();
  const [, navigate] = useLocation();

  return useCallback(() => {
    if (isOverlay) {
      popStack();
      return;
    }
    if (options?.menuFallback) {
      navigate("/menu");
      return;
    }
    window.history.back();
  }, [isOverlay, popStack, dismiss, navigate, options?.menuFallback]);
}
