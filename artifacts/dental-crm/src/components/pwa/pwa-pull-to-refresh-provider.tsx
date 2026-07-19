import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePwaPullToRefresh } from "@/hooks/use-pwa-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pwa/pull-to-refresh-indicator";
import { refreshAppData } from "@/lib/pwa-refresh";
import { isPwaStandalone } from "@/lib/pwa";

/**
 * App-wide pull-to-refresh for the standalone PWA.
 *
 * Mounted once at the root: document-level touch listeners find the
 * scroll container under the finger, so the gesture works on every page —
 * dashboards, lists, overlays, timelines, auth screens.
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
