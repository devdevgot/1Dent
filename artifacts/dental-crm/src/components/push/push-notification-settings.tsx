import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { IosGroup, IosGroupRow, IosSection } from "@/components/layout/ios-group";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getPushSettingsState,
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
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [hint, setHint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const state = await getPushSettingsState();
      setSupported(state.supported);
      setPermission(state.permission);
      setEnabled(state.subscribed);
      setHint(
        !state.supported
          ? t("push.unsupported")
          : state.permission === "denied"
            ? t("push.deniedHint")
            : !state.serverEnabled
              ? t("push.serverDisabledHint")
              : null,
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleToggle = async (checked: boolean) => {
    if (!supported) {
      toast({ title: t("push.unsupported"), variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      if (checked) {
        const result = await subscribeToPushNotifications();
        if (result === "granted") {
          setEnabled(true);
          setPermission("granted");
          setHint(null);
          toast({ title: t("push.enabled") });
        } else if (result === "denied") {
          setPermission("denied");
          setHint(t("push.deniedHint"));
          toast({ title: t("push.denied"), variant: "destructive" });
        } else if (result === "sw_unavailable") {
          toast({
            title: t("common.error", { defaultValue: "Ошибка" }),
            description: t("push.swNotReady"),
            variant: "destructive",
          });
        } else {
          toast({ title: t("push.serverDisabled"), variant: "destructive" });
        }
      } else {
        await unsubscribeFromPushNotifications();
        setEnabled(false);
        setHint(null);
        toast({ title: t("push.disabled") });
      }
    } catch (err) {
      toast({
        title: t("common.error", { defaultValue: "Ошибка" }),
        description: err instanceof Error ? err.message : t("push.subscribeError"),
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
        <IosGroupRow className="gap-3 items-start">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <SettingsRowIcon icon={BellRing} className="bg-[#ec4899] text-white" />
            <div className="min-w-0">
              <p className="text-sm text-[#0f172a]">{t("push.settingsTitle")}</p>
              <p className="text-xs text-[#64748b]">{t("push.settingsDesc")}</p>
              {hint && (
                <p className="text-xs text-[#d97706] mt-1 leading-relaxed">{hint}</p>
              )}
              {permission === "denied" && (
                <p className="text-xs text-[#64748b] mt-1 leading-relaxed">{t("push.deniedIosHint")}</p>
              )}
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => void handleToggle(v)}
            disabled={loading || busy || permission === "denied"}
          />
        </IosGroupRow>
      </IosGroup>
    </IosSection>
  );
}
