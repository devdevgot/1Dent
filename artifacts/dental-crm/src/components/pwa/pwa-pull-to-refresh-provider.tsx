import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePwaPullToRefresh } from "@/hooks/use-pwa-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pwa/pull-to-refresh-indicator";
import { refreshAppData } from "@/lib/pwa-refresh";
import { isPwaStandalone } from "@/lib/pwa";

/**
 * App-wide pull-to-refresh for the standalone PWA.
 *
 * Mounted once at the root. Pulls the page down from the top (rubber-band),
 * shows a spinner in the revealed gap, then refreshes. Surfaces marked with
 * `data-ptr-ignore` (e.g. schedule timeline drag-to-create) are skipped.
 */
export function PwaPullToRefreshProvider() {
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(
    () => refreshAppData(queryClient),
    [queryClient],
  );

  const pullRefresh = usePwaPullToRefresh({
    onRefresh: handleRefresh,
    enabled: isPwaStandalone(),
  });

  return <PullToRefreshIndicator {...pullRefresh} />;
}
