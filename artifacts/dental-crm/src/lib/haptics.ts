import { isPwaStandalone } from "@/lib/pwa";

/**
 * PWA-only haptic feedback via the Vibration API.
 *
 * Mirrors the Telegram Mini App `haptic` / `hapticNotify` helpers, but:
 * - only fires when the CRM is running as an installed home-screen PWA
 * - never vibrates in a regular browser tab
 * - no-ops on platforms without `navigator.vibrate` (e.g. iOS Safari/PWA)
 */

export type HapticImpact = "light" | "medium" | "heavy";
export type HapticNotification = "success" | "error" | "warning";

const IMPACT_MS: Record<HapticImpact, number> = {
  light: 10,
  medium: 25,
  heavy: 40,
};

const NOTIFY_PATTERN: Record<HapticNotification, number | number[]> = {
  success: [15, 50, 15],
  warning: [30, 60, 30],
  error: [40, 40, 40],
};

function vibrateSafe(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  if (!isPwaStandalone()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Unsupported or blocked — ignore.
  }
}

/** Short impact for taps, navigation, drag-start, PIN digits. */
export function haptic(type: HapticImpact = "light"): void {
  vibrateSafe(IMPACT_MS[type]);
}

/** Patterned feedback for success / warning / error outcomes. */
export function hapticNotify(type: HapticNotification): void {
  vibrateSafe(NOTIFY_PATTERN[type]);
}
