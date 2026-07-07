import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";

const STORAGE_KEY = "dental-crm-query-cache";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_SCHEMA_VERSION = "staff-fast-v2";
const MAX_PERSISTED_CACHE_BYTES = 250_000;
const MAX_PERSISTED_QUERY_BYTES = 80_000;

// Keep localStorage persistence intentionally small. Large clinic-wide
// datasets (patients/procedures/channels) block first paint because the sync
// persister has to JSON.parse them before any route, including /users, renders.
const PERSISTED_ROOT_KEYS = new Set([
  "/api/auth/me",
  "/api/users",
  "/api/analytics/owner",
  "/api/analytics/financial-summary",
]);

function pruneOversizedPersistedCache() {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    // Avoid parsing known-large old caches; this is the hot-path fix for users
    // who already have persisted /api/patients or /api/procedures payloads.
    if (raw.length > MAX_PERSISTED_CACHE_BYTES) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const parsed = JSON.parse(raw) as { buster?: string } | null;
    if (parsed?.buster && parsed.buster !== CACHE_SCHEMA_VERSION) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

pruneOversizedPersistedCache();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Freshly fetched data stays fresh for a minute so navigating between
      // pages doesn't re-show spinners; persisted entries survive reloads.
      staleTime: 60_000,
      gcTime: MAX_AGE_MS,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: STORAGE_KEY,
  throttleTime: 1_000,
});

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister,
  maxAge: MAX_AGE_MS,
  buster: CACHE_SCHEMA_VERSION,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      if (query.state.status !== "success") return false;
      const rootKey = query.queryKey[0];
      if (typeof rootKey !== "string") return false;
      if (!PERSISTED_ROOT_KEYS.has(rootKey)) return false;

      try {
        return JSON.stringify(query.state.data).length <= MAX_PERSISTED_QUERY_BYTES;
      } catch {
        return false;
      }
    },
  },
};

/** Wipe the persisted cache (call on logout / 401). */
export function clearPersistedQueryCache() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode etc.) — nothing to clear
  }
  queryClient.clear();
}
