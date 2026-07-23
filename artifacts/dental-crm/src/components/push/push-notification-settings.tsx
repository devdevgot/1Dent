import { useCallback, useEffect, useState } from "react";
import { BellRing, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { IosGroup, IosGroupRow, IosSection } from "@/components/layout/ios-group";
import { AppDialog } from "@/components/layout/app-dialog";
import { SettingsRowIcon } from "@/components/account/settings-row-icon";
import { PROFILE_ICONS, PROFILE_CARD_CLASS } from "@/lib/profile-icons";
import { useToast } from "@/hooks/use-toast";
import { PwaExclusiveGate } from "@/components/pwa/pwa-exclusive-gate";
import {
  fetchPushPreferences,
  getPushSettingsState,
  isPushSupported,
  savePushPreferences,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  type NotificationPrefGroup,
} from "@/lib/push-notifications";

const PUSH_PWA_FEATURES = [
  "pwa.exclusive.pushFeature1",
  "pwa.exclusive.pushFeature2",
  "pwa.exclusive.pushFeature3",
] as const;

const PREF_GROUPS: NotificationPrefGroup[] = [
  "chats",
  "appointments",
  "payments",
  "stages",
  "treatment",
  "reviews",
  "contracts",
  "broadcasts",
  "operations",
];

function PushNotificationSettingsInner() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [hint, setHint] = useState<string | null>(null);
  const [mutedGroups, setMutedGroups] = useState<NotificationPrefGroup[]>([]);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const state = await getPushSettingsState();
      setPermission(state.permission);
      setEnabled(state.subscribed);
      setHint(
        state.permission === "denied"
          ? t("push.deniedHint")
          : !state.serverEnabled
            ? t("push.serverDisabledHint")
            : null,
      );
      if (state.subscribed) {
        const prefs = await fetchPushPreferences();
        setMutedGroups(prefs.mutedGroups);
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openPrefs = async () => {
    try {
      const prefs = await fetchPushPreferences();
      setMutedGroups(prefs.mutedGroups);
    } catch {
      // keep last known mutedGroups
    }
    setPrefsOpen(true);
  };

  const handleToggle = async (checked: boolean) => {
    setBusy(true);
    try {
      if (checked) {
        const result = await subscribeToPushNotifications();
        if (result === "granted") {
          setEnabled(true);
          setPermission("granted");
          setHint(null);
          toast({ title: t("push.enabled") });
          const prefs = await fetchPushPreferences();
          setMutedGroups(prefs.mutedGroups);
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
        } else if (result === "pwa_required") {
          toast({
            title: t("pwa.exclusive.badge"),
            description: t("pwa.exclusive.pushDesc"),
          });
        } else {
          toast({ title: t("push.serverDisabled"), variant: "destructive" });
        }
      } else {
        await unsubscribeFromPushNotifications();
        setEnabled(false);
        setHint(null);
        setPrefsOpen(false);
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

  const handleGroupToggle = async (group: NotificationPrefGroup, checked: boolean) => {
    // checked=true means notifications ON → remove from muted
    const next = checked
      ? mutedGroups.filter((g) => g !== group)
      : [...new Set([...mutedGroups, group])];
    setMutedGroups(next);
    setPrefsBusy(true);
    try {
      await savePushPreferences(next);
    } catch (err) {
      toast({
        title: t("common.error", { defaultValue: "Ошибка" }),
        description: err instanceof Error ? err.message : t("push.prefsError"),
        variant: "destructive",
      });
      void refresh();
    } finally {
      setPrefsBusy(false);
    }
  };

  if (!isPushSupported()) return null;

  return (
    <>
      <IosSection title={t("push.sectionTitle")}>
        <IosGroup className={PROFILE_CARD_CLASS}>
          <IosGroupRow className="gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <SettingsRowIcon img={PROFILE_ICONS.notifications} />
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
            <div className="flex shrink-0 items-center gap-2 self-center">
              {enabled && (
                <button
                  type="button"
                  onClick={() => void openPrefs()}
                  aria-label={t("push.prefsAria")}
                  title={t("push.prefsTitle")}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[#64748b] transition-colors hover:bg-[#f1ede4] hover:text-[#0f172a] active:scale-95"
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
              <Switch
                className="self-center"
                checked={enabled}
                onCheckedChange={(v) => void handleToggle(v)}
                disabled={loading || busy || permission === "denied"}
              />
            </div>
          </IosGroupRow>
        </IosGroup>
      </IosSection>

      <AppDialog
        open={prefsOpen}
        onOpenChange={setPrefsOpen}
        title={t("push.prefsTitle")}
        description={t("push.prefsDesc")}
        size="md"
        className="max-sm:!bottom-10 max-sm:!rounded-3xl max-sm:mx-3 max-sm:!w-[calc(100%-1.5rem)] max-sm:!max-w-none"
        bodyClassName="max-h-[min(70vh,520px)] overflow-y-auto"
      >
        <div className="space-y-1">
          {PREF_GROUPS.map((group) => {
            const on = !mutedGroups.includes(group);
            return (
              <div
                key={group}
                className="flex items-center gap-3 rounded-xl px-1 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#0f172a]">{t(`push.groups.${group}`)}</p>
                  <p className="text-xs text-[#64748b]">{t(`push.groups.${group}Desc`)}</p>
                </div>
                <Switch
                  className="self-center shrink-0"
                  checked={on}
                  onCheckedChange={(v) => void handleGroupToggle(group, v)}
                  disabled={prefsBusy || loading}
                />
              </div>
            );
          })}
          <div className="flex items-center gap-3 rounded-xl px-1 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[#0f172a]">{t("push.groups.alerts")}</p>
              <p className="text-xs text-[#64748b]">{t("push.groups.alertsDesc")}</p>
            </div>
            <Switch className="self-center shrink-0" checked disabled />
          </div>
        </div>
      </AppDialog>
    </>
  );
}

export function PushNotificationSettings() {
  const { t } = useTranslation();

  return (
    <PwaExclusiveGate
      sectionTitle={t("push.sectionTitle")}
      icon={BellRing}
      iconClassName="bg-[#ec4899] text-white"
      titleKey="pwa.exclusive.pushTitle"
      descriptionKey="pwa.exclusive.pushDesc"
      featureKeys={[...PUSH_PWA_FEATURES]}
    >
      <PushNotificationSettingsInner />
    </PwaExclusiveGate>
  );
}
