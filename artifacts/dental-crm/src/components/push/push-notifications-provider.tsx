import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { AppBadgeSync } from "@/components/push/app-badge-sync";
import { syncPushSubscriptionIfGranted } from "@/lib/push-notifications";
import { addServiceWorkerMessageHandler, isPwaStandalone } from "@/lib/pwa";

export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isPwaStandalone()) return;
    if (!isAuthenticated || !user?.id) return;
    void syncPushSubscriptionIfGranted();
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    return addServiceWorkerMessageHandler((data) => {
      if (data.type === "1DENT_PUSH_NAVIGATE" && typeof data.url === "string" && data.url) {
        try {
          const parsed = new URL(data.url, window.location.origin);
          if (parsed.origin === window.location.origin) {
            navigate(parsed.pathname + parsed.search + parsed.hash);
          }
        } catch {
          // ignore malformed urls
        }
      }
    });
  }, [navigate]);

  return (
    <>
      <AppBadgeSync />
      {children}
    </>
  );
}
