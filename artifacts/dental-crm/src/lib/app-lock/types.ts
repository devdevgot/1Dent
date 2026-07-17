export type AppLockIdleMinutes = 0 | 1 | 5 | 15 | 30;

export type AppLockConfig = {
  enabled: boolean;
  userId: string;
  /** PBKDF2 hash of the 4-digit PIN (base64). */
  pinHash?: string;
  /** Salt for PIN hashing (base64). */
  pinSalt?: string;
  /** WebAuthn credential id (base64url), if biometrics enabled. */
  credentialId?: string;
  biometricEnabled: boolean;
  /** Lock after N minutes in background; 0 = immediately on return. */
  idleMinutes: AppLockIdleMinutes;
};

export const APP_LOCK_STORAGE_KEY = "1dent:app-lock-config";
export const APP_LOCK_LAST_UNLOCK_KEY = "1dent:app-lock-last-unlock";
export const APP_LOCK_LAST_HIDDEN_KEY = "1dent:app-lock-last-hidden";

export const DEFAULT_IDLE_MINUTES: AppLockIdleMinutes = 5;
