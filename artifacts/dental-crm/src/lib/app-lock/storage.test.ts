import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  markAppHidden,
  markAppUnlocked,
  shouldLockOnResume,
  clearAppLockSessionMarkers,
  getLastHiddenAt,
  getLastUnlockAt,
} from "./storage";
import type { AppLockConfig } from "./types";

function installMemoryStorage(): void {
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key() {
      return null;
    },
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", {
    value: memoryStorage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStorage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
  });
}

function baseConfig(idleMinutes: AppLockConfig["idleMinutes"]): AppLockConfig {
  return {
    enabled: true,
    userId: "user-1",
    biometricEnabled: true,
    idleMinutes,
    pinHash: "hash",
    pinSalt: "salt",
  };
}

describe("app-lock storage resume/unlock", () => {
  beforeEach(() => {
    installMemoryStorage();
    clearAppLockSessionMarkers();
  });

  it("markAppUnlocked clears the background hidden marker", () => {
    markAppHidden();
    assert.ok(getLastHiddenAt() > 0);

    markAppUnlocked();
    assert.equal(getLastHiddenAt(), 0);
    assert.ok(getLastUnlockAt() > 0);
  });

  it("does not re-lock immediately after unlock when idle is «Сразу»", () => {
    // Simulate Face ID sheet: background marker, then successful unlock.
    markAppHidden();
    markAppUnlocked();

    assert.equal(shouldLockOnResume(baseConfig(0)), false);
  });

  it("locks on resume when idle is «Сразу» and app was backgrounded after unlock", () => {
    const now = Date.now();
    sessionStorage.setItem("1dent:app-lock-last-unlock", String(now - 1_000));
    sessionStorage.setItem("1dent:app-lock-last-hidden", String(now));

    assert.equal(shouldLockOnResume(baseConfig(0)), true);
  });

  it("ignores stale hidden markers older than the latest unlock", () => {
    const now = Date.now();
    sessionStorage.setItem("1dent:app-lock-last-hidden", String(now - 5_000));
    sessionStorage.setItem("1dent:app-lock-last-unlock", String(now));

    assert.equal(shouldLockOnResume(baseConfig(0)), false);
  });

  it("locks after idle timeout when backgrounded long enough", () => {
    const now = Date.now();
    sessionStorage.setItem("1dent:app-lock-last-unlock", String(now - 10 * 60_000));
    sessionStorage.setItem("1dent:app-lock-last-hidden", String(now - 6 * 60_000));

    assert.equal(shouldLockOnResume(baseConfig(5)), true);
  });

  it("does not lock before idle timeout elapses", () => {
    const now = Date.now();
    sessionStorage.setItem("1dent:app-lock-last-unlock", String(now - 60_000));
    sessionStorage.setItem("1dent:app-lock-last-hidden", String(now - 30_000));

    assert.equal(shouldLockOnResume(baseConfig(5)), false);
  });
});
