import { useEffect } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import { syncPushSubscriptionIfGranted } from "@/lib/push-notifications";

export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    void syncPushSubscriptionIfGranted();
  }, [isAuthenticated, user?.id]);

  return <>{children}</>;
}
