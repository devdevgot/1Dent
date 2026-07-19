import type { QueryClient } from "@tanstack/react-query";

/** Invalidate and refetch active React Query caches (PWA pull-to-refresh). */
export async function refreshAppData(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries();
  await queryClient.refetchQueries({ type: "active" });
}
