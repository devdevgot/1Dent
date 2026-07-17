import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { IosGroup, IosGroupRow, IosSection } from "@/components/layout/ios-group";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  fetchPushStatus,
  getNotificationPermission,
  isPushSupported,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/lib/push-notifications";

function SettingsRowIcon({
  icon: Icon,
  className,
}: {
  icon: typeof BellRing;
  className: string;
}) {
  return (
    <div
      className={cn(
        "w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0",
        className,
      )}
    >
      <Icon className="w-[17px] h-[17px]" strokeWidth={2.2} />
    </div>
  );
}

export function PushNotificationSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [serverEnabled, setServerEnabled] = useState(false);
  const supported = isPushSupported();
  const permission = getNotificationPermission();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const status = await fetchPushStatus();
      setServerEnabled(status.enabled);
      setEnabled(supported && permission === "granted" && status.enabled);
    } finally {
      setLoading(false);
    }
  }, [permission, supported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleToggle = async (checked: boolean) => {
    if (!supported) {
      toast({
        title: t("push.unsupported"),
        variant: "destructive",
      });
      return;
    }

    if (!serverEnabled) {
      toast({
        title: t("push.serverDisabled"),
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    try {
      if (checked) {
        const result = await subscribeToPushNotifications();
        if (result === "granted") {
          setEnabled(true);
          toast({ title: t("push.enabled") });
        } else if (result === "denied") {
          toast({ title: t("push.denied"), variant: "destructive" });
        } else {
          toast({ title: t("push.serverDisabled"), variant: "destructive" });
        }
      } else {
        await unsubscribeFromPushNotifications();
        setEnabled(false);
        toast({ title: t("push.disabled") });
      }
    } catch {
      toast({
        title: t("common.error", { defaultValue: "Ошибка" }),
        description: t("push.subscribeError"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  if (!supported) return null;

  return (
    <IosSection title={t("push.sectionTitle")}>
      <IosGroup>
        <IosGroupRow className="gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <SettingsRowIcon icon={BellRing} className="bg-[#ec4899] text-white" />
            <div className="min-w-0">
              <p className="text-sm text-[#0f172a]">{t("push.settingsTitle")}</p>
              <p className="text-xs text-[#64748b]">{t("push.settingsDesc")}</p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => void handleToggle(v)}
            disabled={loading || busy || !serverEnabled}
          />
        </IosGroupRow>
      </IosGroup>
    </IosSection>
  );
}
