import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";

const STORAGE_KEY = "dental-crm-query-cache";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

// Only these endpoints are persisted to localStorage. They power the pages
// that must paint instantly (dashboard, staff) and are safe to show stale
// while a background refetch runs.
const PERSISTED_KEY_PREFIXES = [
  "/api/auth/me",
  "/api/users",
  "/api/analytics/owner",
  "/api/analytics/financial-summary",
  "/api/kpi/doctors",
  "/api/procedures",
  "/api/patients",
  "/api/channels",
];

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
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      if (query.state.status !== "success") return false;
      const rootKey = query.queryKey[0];
      if (typeof rootKey !== "string") return false;
      return PERSISTED_KEY_PREFIXES.some((prefix) => rootKey.startsWith(prefix));
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
