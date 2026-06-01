import { useEffect } from "react";
import WebApp from "@twa-dev/sdk";

export function useTgBackButton(onBack: () => void) {
  useEffect(() => {
    const handler = () => onBack();
    try {
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(handler);
    } catch {
      // not in TMA context
    }
    return () => {
      try {
        WebApp.BackButton.offClick(handler);
        WebApp.BackButton.hide();
      } catch {
        // not in TMA context
      }
    };
  }, [onBack]);
}

export function haptic(type: "light" | "medium" | "heavy" | "rigid" | "soft" = "light") {
  try { WebApp.HapticFeedback.impactOccurred(type); } catch { /* noop */ }
}

export function hapticNotify(type: "success" | "error" | "warning") {
  try { WebApp.HapticFeedback.notificationOccurred(type); } catch { /* noop */ }
}

export function tgConfirm(message: string, cb: (confirmed: boolean) => void) {
  try {
    WebApp.showConfirm(message, cb);
  } catch {
    cb(window.confirm(message));
  }
}

export function tgAlert(message: string, cb?: () => void) {
  try {
    WebApp.showAlert(message, cb);
  } catch {
    window.alert(message);
    cb?.();
  }
}
