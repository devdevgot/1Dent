import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RELOAD_KEY = "crm-chunk-reload";

export function clearChunkReloadFlag(): void {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
}

export function isMissingLazyExportError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  const msg = err.message;
  // Safari/WebKit after a stale deploy: undefined is not an object (evaluating 'e.PlanPaywall')
  if (/undefined is not an object \(evaluating '/i.test(msg)) return true;
  // Chromium: Cannot read properties of undefined (reading 'PlanPaywall')
  if (/cannot read propert(?:y|ies) of undefined/i.test(msg)) return true;
  return false;
}

export function isChunkLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("'text/html' is not a valid javascript mime type") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("failed to load module script") ||
    msg.includes("error loading module script") ||
    msg.includes("missing default export") ||
    // Safari often surfaces a bare "Load failed" / "Cancelled" on 404 chunks.
    msg === "load failed" ||
    msg === "cancelled" ||
    msg.includes("loading css chunk") ||
    isMissingLazyExportError(err)
  );
}

async function clearStaleDeployCaches(): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.includes("1dent-pwa") || key.includes("assets") || key.includes("shell"))
        .map((key) => caches.delete(key)),
    );
  } catch {
    // Cache API unavailable — still reload.
  }
}

/** Reload once after deploy when a stale tab requests a removed lazy chunk. */
export function reloadOnceOnChunkError(err: unknown): void {
  if (!isChunkLoadError(err)) throw err;
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) throw err;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  void clearStaleDeployCaches().finally(() => {
    window.location.reload();
  });
}

function loadWithChunkRecovery<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
): Promise<{ default: T }> {
  return load()
    .then((mod) => {
      if (!mod?.default) {
        throw new TypeError(
          "Failed to fetch dynamically imported module: missing default export",
        );
      }
      return mod;
    })
    .catch((err) => {
      reloadOnceOnChunkError(err);
      return new Promise<{ default: T }>(() => {});
    });
}

/** Drop-in replacement for React.lazy with one-shot auto-reload on stale chunks. */
export function lazyWithChunkRecovery<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => loadWithChunkRecovery(load));
}

/** Prefetch a lazy page so the first open after deploy doesn't race a stale shell. */
export function prefetchLazyPage(load: () => Promise<unknown>): void {
  void load().catch(() => {
    // Prefetch failures are non-fatal; navigation recovery handles them.
  });
}

export function installChunkReloadHandlers(): void {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    void clearStaleDeployCaches().finally(() => {
      window.location.reload();
    });
  });

  // New service worker after deploy — refresh once so lazy chunk hashes match.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type !== "SW_UPDATED") return;
      if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      void clearStaleDeployCaches().finally(() => {
        window.location.reload();
      });
    });
  }
}
