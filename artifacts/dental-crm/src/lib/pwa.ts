import { useSyncExternalStore } from "react";

/**
 * PWA install + service-worker helper.
 *
 * Captures the platform install prompt (Chrome/Edge/Android/desktop Chromium),
 * tracks whether the app is already installed / running standalone, and detects
 * iOS Safari where install must be done via the Share menu (no programmatic API).
 */

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaState = {
  /** Native install prompt is available (Android/desktop Chromium). */
  canPrompt: boolean;
  /** App is already installed / launched from the home screen. */
  isStandalone: boolean;
  /** iOS/iPadOS Safari — install only via Share → "На экран «Домой»". */
  isIos: boolean;
  /** The app was installed during this session. */
  justInstalled: boolean;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let justInstalled = false;
let initialized = false;

const listeners = new Set<() => void>();

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayModes = ["standalone", "fullscreen", "minimal-ui"];
  const matchesDisplayMode = displayModes.some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches,
  );
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;
  return matchesDisplayMode || iosStandalone;
}

/** True when CRM is opened from the home-screen PWA (not a browser tab). */
export function isPwaStandalone(): boolean {
  return detectStandalone();
}

function detectIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isAppleTouch = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as "Macintosh" but exposes touch points.
  const isIpadOs =
    /macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return isAppleTouch || isIpadOs;
}

let cachedSnapshot: PwaState | null = null;

function computeSnapshot(): PwaState {
  return {
    canPrompt: deferredPrompt !== null,
    isStandalone: detectStandalone(),
    isIos: detectIos(),
    justInstalled,
  };
}

function getSnapshot(): PwaState {
  // useSyncExternalStore requires a stable reference between emits.
  if (cachedSnapshot === null) cachedSnapshot = computeSnapshot();
  return cachedSnapshot;
}

function getServerSnapshot(): PwaState {
  return {
    canPrompt: false,
    isStandalone: false,
    isIos: false,
    justInstalled: false,
  };
}

function emit(): void {
  cachedSnapshot = computeSnapshot();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Start listening for install-related browser events. Safe to call once. */
export function initPwa(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Prevent the mini-infobar so we can surface our own install UI.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    justInstalled = true;
    emit();
  });

  const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
  standaloneQuery?.addEventListener?.("change", () => {
    applyStandaloneDocumentClass();
    emit();
  });

  applyStandaloneDocumentClass();
}

/** Apply CSS hooks for installed / standalone layout (safe-area, viewport height). */
export function applyStandaloneDocumentClass(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const standalone = detectStandalone();
  root.classList.toggle("pwa-standalone", standalone);
  root.classList.toggle("pwa-ios-standalone", standalone && detectIos());
}

const PWA_SPLASH_ID = "pwa-splash";
const PWA_SPLASH_MIN_MS = 450;
const PWA_SPLASH_FADE_MS = 280;

/**
 * Fade out and remove the in-app PWA splash (#pwa-splash from index.html).
 * No-op outside standalone / when the splash was already dismissed.
 */
export function dismissPwaSplash(): void {
  if (typeof document === "undefined") return;
  const splash = document.getElementById(PWA_SPLASH_ID);
  if (!splash || splash.getAttribute("data-dismissed") === "1") return;

  splash.setAttribute("data-dismissed", "1");

  const shownAtRaw = splash.getAttribute("data-shown-at");
  const shownAt = shownAtRaw ? Number(shownAtRaw) : 0;
  const elapsed = shownAt > 0 ? Date.now() - shownAt : PWA_SPLASH_MIN_MS;
  const wait = Math.max(0, PWA_SPLASH_MIN_MS - elapsed);

  window.setTimeout(() => {
    splash.classList.add("is-hiding");
    document.documentElement.classList.remove("pwa-splash-active");
    window.setTimeout(() => {
      splash.remove();
    }, PWA_SPLASH_FADE_MS);
  }, wait);
}

/**
 * Trigger the native install prompt. Returns the user's choice, or
 * "unavailable" when no deferred prompt exists (e.g. iOS Safari).
 */
export async function promptInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  if (!deferredPrompt) return "unavailable";
  const prompt = deferredPrompt;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      deferredPrompt = null;
      emit();
    }
    return choice.outcome;
  } catch {
    return "dismissed";
  } finally {
    // A prompt can only be used once.
    if (deferredPrompt === prompt) {
      deferredPrompt = null;
      emit();
    }
  }
}

type ServiceWorkerMessageHandler = (data: { type?: string }) => void;

let swMessageHandler: ServiceWorkerMessageHandler | null = null;

/** Listen for service-worker messages (e.g. Background Sync → flush outbox). */
export function setServiceWorkerMessageHandler(
  handler: ServiceWorkerMessageHandler | null,
): void {
  swMessageHandler = handler;
}

/** Ask the service worker to register a Background Sync tag for the outbox. */
export function requestOutboxBackgroundSync(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const controller = navigator.serviceWorker.controller;
  if (!controller) return;
  controller.postMessage({ type: "REQUEST_OUTBOX_SYNC" });
}

/** Register the service worker in production builds. */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  const register = () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures must never break the app.
    });
  };

  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data as { type?: string } | null;
    if (!data?.type) return;
    swMessageHandler?.(data);
  });

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}

export type UsePwaInstall = PwaState & {
  /**
   * Whether to offer any install affordance: a native prompt is available, or
   * the user is on iOS Safari and hasn't installed yet.
   */
  canInstall: boolean;
  promptInstall: typeof promptInstall;
};

export function usePwaInstall(): UsePwaInstall {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const canInstall =
    !state.isStandalone && (state.canPrompt || state.isIos);
  return { ...state, canInstall, promptInstall };
}
