import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useAppLockStore } from "@/lib/app-lock/store";
import { markAppHidden } from "@/lib/app-lock/storage";
import { loadAppLockConfig } from "@/lib/app-lock/storage";
import { AppLockScreen } from "./app-lock-screen";
import { isPwaStandalone } from "@/lib/pwa";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];
const SKIP_LOCK_PREFIXES = ["/tablet"];

function shouldSkipAppLock(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return true;
  return SKIP_LOCK_PREFIXES.some((p) => pathname.startsWith(p));
}

interface AppLockProviderProps {
  children: ReactNode;
}

export function AppLockProvider({ children }: AppLockProviderProps) {
  const [location] = useLocation();
  const { user, isLoading } = useAuthStore();
  const init = useAppLockStore((s) => s.init);
  const reset = useAppLockStore((s) => s.reset);
  const isLocked = useAppLockStore((s) => s.isLocked);
  const isInitialized = useAppLockStore((s) => s.isInitialized);
  const lock = useAppLockStore((s) => s.lock);
  const checkResumeLock = useAppLockStore((s) => s.checkResumeLock);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!user?.id) {
      reset();
      return;
    }

    init(String(user.id));
  }, [user?.id, isLoading, init, reset]);

  useEffect(() => {
    if (!isPwaStandalone()) return;
    const active = loadAppLockConfig();
    if (!active || !isInitialized) return;

    const clearIdleTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const scheduleIdleLock = () => {
      clearIdleTimer();
      const minutes = active.idleMinutes ?? 5;
      if (minutes <= 0) return;

      idleTimerRef.current = setTimeout(() => lock(), minutes * 60 * 1000);
    };

    const onActivity = () => {
      if (!isLocked) scheduleIdleLock();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // While the lock screen is up, Face ID / system sheets can flip
        // visibility — do not treat that as a background idle interval.
        if (!isLocked) markAppHidden();
        clearIdleTimer();
      } else {
        checkResumeLock();
        if (!useAppLockStore.getState().isLocked) scheduleIdleLock();
      }
    };

    scheduleIdleLock();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("touchstart", onActivity, { passive: true });

    return () => {
      clearIdleTimer();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [isInitialized, isLocked, lock, checkResumeLock]);

  const skip = shouldSkipAppLock(location);
  const active = loadAppLockConfig();
  const showLock =
    isPwaStandalone() &&
    !skip &&
    !isLoading &&
    Boolean(user?.id) &&
    isInitialized &&
    Boolean(active) &&
    isLocked;

  return (
    <>
      {children}
      {showLock && <AppLockScreen />}
    </>
  );
}
