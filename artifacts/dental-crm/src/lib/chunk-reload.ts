import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RELOAD_KEY = "crm-chunk-reload";

export function clearChunkReloadFlag(): void {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
}

export function isChunkLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("'text/html' is not a valid javascript mime type") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

/** Reload once after deploy when a stale tab requests a removed lazy chunk. */
export function reloadOnceOnChunkError(err: unknown): void {
  if (!isChunkLoadError(err)) throw err;
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) throw err;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  window.location.reload();
}

function loadWithChunkRecovery<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
): Promise<{ default: T }> {
  return load().catch((err) => {
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

export function installChunkReloadHandlers(): void {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    window.location.reload();
  });
}
