import type { AppLockConfig, AppLockIdleMinutes } from "./types";
import {
  APP_LOCK_LAST_HIDDEN_KEY,
  APP_LOCK_LAST_UNLOCK_KEY,
  APP_LOCK_STORAGE_KEY,
  DEFAULT_IDLE_MINUTES,
} from "./types";

export function loadAppLockConfigRaw(): AppLockConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(APP_LOCK_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppLockConfig;
  } catch {
    return null;
  }
}

export function loadAppLockConfig(): AppLockConfig | null {
  const parsed = loadAppLockConfigRaw();
  if (!parsed?.enabled || !parsed.userId || !parsed.pinHash || !parsed.pinSalt) {
    return null;
  }
  return parsed;
}

export function getOrCreateAppLockConfig(userId: string): AppLockConfig {
  const existing = loadAppLockConfigRaw();
  if (existing?.userId === userId) return existing;

  return {
    enabled: false,
    userId,
    biometricEnabled: false,
    idleMinutes: DEFAULT_IDLE_MINUTES,
  };
}

export function saveAppLockConfig(config: AppLockConfig): void {
  localStorage.setItem(APP_LOCK_STORAGE_KEY, JSON.stringify(config));
}

export function clearAppLockConfig(): void {
  localStorage.removeItem(APP_LOCK_STORAGE_KEY);
  clearAppLockSessionMarkers();
}

export function clearAppLockSessionMarkers(): void {
  sessionStorage.removeItem(APP_LOCK_LAST_UNLOCK_KEY);
  sessionStorage.removeItem(APP_LOCK_LAST_HIDDEN_KEY);
}

export function markAppUnlocked(): void {
  sessionStorage.setItem(APP_LOCK_LAST_UNLOCK_KEY, String(Date.now()));
  // Clear any prior background marker so resume-lock cannot immediately
  // re-lock after a successful Face ID / PIN unlock (common on iOS when the
  // biometric sheet toggles document.visibilityState).
  sessionStorage.removeItem(APP_LOCK_LAST_HIDDEN_KEY);
}

export function markAppHidden(): void {
  sessionStorage.setItem(APP_LOCK_LAST_HIDDEN_KEY, String(Date.now()));
}

export function getLastUnlockAt(): number {
  const raw = sessionStorage.getItem(APP_LOCK_LAST_UNLOCK_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function getLastHiddenAt(): number {
  const raw = sessionStorage.getItem(APP_LOCK_LAST_HIDDEN_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function idleMsForConfig(idleMinutes: AppLockIdleMinutes): number {
  if (idleMinutes === 0) return 0;
  return idleMinutes * 60_000;
}

export function configMatchesUser(
  config: AppLockConfig | null,
  userId: string | undefined,
): config is AppLockConfig {
  return !!config && !!userId && config.userId === userId;
}

export function shouldLockOnResume(config: AppLockConfig): boolean {
  const hiddenAt = getLastHiddenAt();
  if (!hiddenAt) return false;

  // Ignore stale background markers from before the latest unlock (e.g. the
  // Face ID system sheet briefly hiding the document while still locked).
  const unlockedAt = getLastUnlockAt();
  if (unlockedAt && hiddenAt < unlockedAt) return false;

  const idleMs = idleMsForConfig(config.idleMinutes);
  if (idleMs === 0) return true;

  return Date.now() - hiddenAt >= idleMs;
}
