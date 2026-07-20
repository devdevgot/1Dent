import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetUnreadNotificationsCountQueryKey } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useUnreadCount } from "@/hooks/use-notifications";
import { clearAppBadge, syncAppBadge } from "@/lib/app-badge";
import { isPwaStandalone } from "@/lib/pwa";
import { getNotificationPermission } from "@/lib/push-notifications";

/**
 * Keeps the installed PWA home-screen badge in sync with unread notifications.
 * Requires Add-to-Home-Screen + notification permission (iOS/Android PWA).
 */
export function AppBadgeSync() {
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuthStore();
  const [permission, setPermission] = useState(() => getNotificationPermission());

  useEffect(() => {
    const refresh = () => setPermission(getNotificationPermission());
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    const id = window.setInterval(refresh, 15_000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(id);
    };
  }, []);

  const enabled =
    isAuthenticated &&
    Boolean(user?.id) &&
    isPwaStandalone() &&
    permission === "granted";

  const { data } = useUnreadCount({ enabled });
  const count = data?.data?.count ?? 0;

  useEffect(() => {
    if (!enabled) {
      void clearAppBadge();
      return;
    }
    void syncAppBadge(count);
  }, [enabled, count]);

  useEffect(() => {
    if (!enabled) return;

    const refreshUnread = () => {
      void queryClient.invalidateQueries({
        queryKey: getGetUnreadNotificationsCountQueryKey(),
      });
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshUnread();
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "1DENT_SYNC_APP_BADGE") {
        refreshUnread();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [enabled, queryClient]);

  return null;
}
