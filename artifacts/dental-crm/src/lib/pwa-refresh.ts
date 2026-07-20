import type { Query, QueryClient } from "@tanstack/react-query";

/** Min gap between PTR refreshes — avoids request storms / auth rate limits. */
const MIN_REFRESH_INTERVAL_MS = 3_000;

/** Session endpoint is long-lived; refetching it on every pull trips /auth rate limits. */
const SKIP_PTR_ROOT_KEYS = new Set(["/api/auth/me"]);

let lastRefreshAt = 0;
let refreshInFlight: Promise<void> | null = null;

function shouldRefreshQuery(query: Query): boolean {
  const root = query.queryKey[0];
  return typeof root === "string" && !SKIP_PTR_ROOT_KEYS.has(root);
}

/** Invalidate and refetch active React Query caches (PWA pull-to-refresh). */
export async function refreshAppData(queryClient: QueryClient): Promise<void> {
  const now = Date.now();
  if (refreshInFlight) return refreshInFlight;
  if (now - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) return;

  lastRefreshAt = now;

  refreshInFlight = (async () => {
    try {
      await queryClient.invalidateQueries({ predicate: shouldRefreshQuery });
      await queryClient.refetchQueries({
        type: "active",
        predicate: shouldRefreshQuery,
      });
    } catch {
      // Individual query failures are handled by React Query; never surface PTR noise.
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
