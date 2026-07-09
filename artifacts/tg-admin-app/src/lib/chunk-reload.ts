const CHUNK_RELOAD_KEY = "tma-chunk-reload";

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

export function reloadOnceOnChunkError(err: unknown): void {
  if (!isChunkLoadError(err)) throw err;
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) throw err;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  window.location.reload();
}

export function installChunkReloadHandlers(): void {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    window.location.reload();
  });
}
