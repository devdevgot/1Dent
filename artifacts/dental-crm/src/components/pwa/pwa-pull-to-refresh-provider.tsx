import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePwaPullToRefresh } from "@/hooks/use-pwa-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pwa/pull-to-refresh-indicator";
import { refreshAppData } from "@/lib/pwa-refresh";
import { isPwaStandalone } from "@/lib/pwa";

/**
 * App-wide pull-to-refresh for the standalone PWA.
 *
 * Mounted once at the root. Rubber-bands the nearest `data-ptr-surface`
 * (home chrome, menu overlays, etc.) so the iOS spinner sits in the revealed
 * gap above the page — never over search/title. `data-ptr-ignore` skips
 * schedule drag-to-create.
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
