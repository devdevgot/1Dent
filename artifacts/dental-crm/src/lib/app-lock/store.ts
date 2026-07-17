import { create } from "zustand";
import { hashPin, verifyPin } from "./crypto";
import {
  clearAppLockSessionMarkers,
  configMatchesUser,
  getLastUnlockAt,
  getOrCreateAppLockConfig,
  loadAppLockConfig,
  markAppUnlocked,
  saveAppLockConfig,
  shouldLockOnResume,
} from "./storage";
import {
  authenticateAppLockCredential,
  canUseBiometricUnlock,
  registerAppLockCredential,
} from "./webauthn";
import type { AppLockConfig, AppLockIdleMinutes } from "./types";

interface AppLockState {
  config: AppLockConfig | null;
  isLocked: boolean;
  isInitialized: boolean;
  failedAttempts: number;
  init: (userId: string) => void;
  reset: () => void;
  lock: () => void;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometric: () => Promise<boolean>;
  setupPin: (pin: string) => Promise<void>;
  enableBiometric: (displayName: string) => Promise<void>;
  disableBiometric: () => void;
  setEnabled: (enabled: boolean) => void;
  setIdleMinutes: (minutes: AppLockIdleMinutes) => void;
  checkResumeLock: () => void;
  refreshConfig: (userId: string) => void;
}

export const useAppLockStore = create<AppLockState>((set, get) => ({
  config: null,
  isLocked: false,
  isInitialized: false,
  failedAttempts: 0,

  init: (userId) => {
    const active = loadAppLockConfig();
    const shouldLock =
      configMatchesUser(active, userId) &&
      (!getLastUnlockAt() || shouldLockOnResume(active));

    set({
      config: getOrCreateAppLockConfig(userId),
      isLocked: Boolean(shouldLock),
      isInitialized: true,
      failedAttempts: 0,
    });
  },

  reset: () => {
    set({
      config: null,
      isLocked: false,
      isInitialized: false,
      failedAttempts: 0,
    });
  },

  lock: () => {
    const active = loadAppLockConfig();
    if (!active) return;
    set({ isLocked: true, failedAttempts: 0 });
  },

  unlockWithPin: async (pin) => {
    const active = loadAppLockConfig();
    if (!active?.pinHash || !active?.pinSalt) return false;

    const ok = await verifyPin(pin, active.pinHash, active.pinSalt);
    if (ok) {
      markAppUnlocked();
      set({ isLocked: false, failedAttempts: 0 });
      return true;
    }

    set((s) => ({ failedAttempts: s.failedAttempts + 1 }));
    return false;
  },

  unlockWithBiometric: async () => {
    const active = loadAppLockConfig();
    if (!active?.credentialId) return false;

    try {
      const ok = await authenticateAppLockCredential(active.credentialId);
      if (ok) {
        markAppUnlocked();
        set({ isLocked: false, failedAttempts: 0 });
        return true;
      }
    } catch {
      /* cancelled or unavailable */
    }
    return false;
  },

  setupPin: async (pin) => {
    const { config } = get();
    if (!config) return;

    const { hash, salt } = await hashPin(pin);
    const next: AppLockConfig = {
      ...config,
      enabled: true,
      pinHash: hash,
      pinSalt: salt,
    };
    saveAppLockConfig(next);
    markAppUnlocked();
    set({ config: next, isLocked: false, failedAttempts: 0 });
  },

  enableBiometric: async (displayName) => {
    const { config } = get();
    if (!config) return;

    const available = await canUseBiometricUnlock();
    if (!available) throw new Error("biometric_unavailable");

    const credentialId = await registerAppLockCredential(config.userId, displayName);
    const next: AppLockConfig = {
      ...config,
      biometricEnabled: true,
      credentialId,
    };
    saveAppLockConfig(next);
    set({ config: next });
  },

  disableBiometric: () => {
    const { config } = get();
    if (!config) return;

    const next: AppLockConfig = {
      ...config,
      biometricEnabled: false,
      credentialId: undefined,
    };
    saveAppLockConfig(next);
    set({ config: next });
  },

  setEnabled: (enabled) => {
    const { config } = get();
    if (!config) return;

    if (!enabled) {
      clearAppLockSessionMarkers();
      const next: AppLockConfig = {
        ...config,
        enabled: false,
        biometricEnabled: false,
        credentialId: undefined,
        pinHash: undefined,
        pinSalt: undefined,
      };
      saveAppLockConfig(next);
      set({ config: next, isLocked: false, failedAttempts: 0 });
      return;
    }

    if (!config.pinHash || !config.pinSalt) return;

    const next = { ...config, enabled: true };
    saveAppLockConfig(next);
    markAppUnlocked();
    set({ config: next, isLocked: false });
  },

  setIdleMinutes: (minutes) => {
    const { config } = get();
    if (!config) return;

    const next = { ...config, idleMinutes: minutes };
    saveAppLockConfig(next);
    set({ config: next });
  },

  checkResumeLock: () => {
    const active = loadAppLockConfig();
    const { isLocked } = get();
    if (!active || isLocked) return;

    if (shouldLockOnResume(active)) {
      set({ isLocked: true, failedAttempts: 0 });
    }
  },

  refreshConfig: (userId) => {
    set({ config: getOrCreateAppLockConfig(userId) });
  },
}));
