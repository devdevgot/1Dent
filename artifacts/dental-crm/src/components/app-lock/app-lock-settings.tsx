import { useEffect, useState } from "react";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { IosGroup, IosGroupRow, IosSection } from "@/components/layout/ios-group";
import { useAppLockStore } from "@/lib/app-lock/store";
import { canUseBiometricUnlock } from "@/lib/app-lock/webauthn";
import type { AppLockIdleMinutes } from "@/lib/app-lock/types";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AppLockSetupModal } from "./app-lock-setup-modal";

const IDLE_OPTIONS: AppLockIdleMinutes[] = [0, 1, 5, 15, 30];

function SettingsRowIcon({
  icon: Icon,
  className,
}: {
  icon: typeof ShieldCheck;
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

export function AppLockSettingsSection({ userName }: { userName: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const config = useAppLockStore((s) => s.config);
  const setupPin = useAppLockStore((s) => s.setupPin);
  const setEnabled = useAppLockStore((s) => s.setEnabled);
  const enableBiometric = useAppLockStore((s) => s.enableBiometric);
  const disableBiometric = useAppLockStore((s) => s.disableBiometric);
  const setIdleMinutes = useAppLockStore((s) => s.setIdleMinutes);
  const refreshConfig = useAppLockStore((s) => s.refreshConfig);

  const [setupOpen, setSetupOpen] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    void canUseBiometricUnlock().then(setBiometricAvailable);
  }, []);

  if (!config) return null;

  const hasPin = Boolean(config.pinHash && config.pinSalt);

  const handleToggle = (checked: boolean) => {
    if (checked && !hasPin) {
      setSetupOpen(true);
      return;
    }
    setEnabled(checked);
    if (!checked) {
      toast({ title: t("appLock.disabled") });
    }
  };

  const handleSetup = async (pin: string) => {
    setSetupLoading(true);
    try {
      await setupPin(pin);
      setSetupOpen(false);
      toast({ title: t("appLock.enabled") });
    } catch {
      toast({
        title: t("common.error"),
        description: t("appLock.setupError"),
        variant: "destructive",
      });
    } finally {
      setSetupLoading(false);
    }
  };

  const handleBiometricToggle = async (checked: boolean) => {
    if (!config.enabled || !hasPin) return;

    setBiometricLoading(true);
    try {
      if (checked) {
        await enableBiometric(userName);
        toast({ title: t("appLock.biometricEnabled") });
      } else {
        disableBiometric();
        toast({ title: t("appLock.biometricDisabled") });
      }
    } catch {
      toast({
        title: t("common.error"),
        description: t("appLock.biometricUnavailable"),
        variant: "destructive",
      });
    } finally {
      setBiometricLoading(false);
      refreshConfig(config.userId);
    }
  };

  const handleChangePin = () => {
    setSetupOpen(true);
  };

  return (
    <>
      <IosSection title={t("settingsPage.security")}>
        <IosGroup>
          <IosGroupRow className="gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <SettingsRowIcon icon={ShieldCheck} className="bg-[#1f75fe] text-white" />
              <div className="min-w-0">
                <p className="text-sm text-[#0f172a]">{t("appLock.settingsTitle")}</p>
                <p className="text-xs text-[#64748b]">{t("appLock.settingsDesc")}</p>
              </div>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={handleToggle}
              disabled={setupLoading}
            />
          </IosGroupRow>

          {config.enabled && (
            <>
              <IosGroupRow
                as="button"
                onClick={handleChangePin}
                className="cursor-pointer hover:bg-[#faf8f4]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <SettingsRowIcon icon={ShieldCheck} className="bg-[var(--text-secondary)] text-white" />
                  <span className="text-sm text-[#0f172a]">{t("appLock.changePin")}</span>
                </div>
                <span className="text-xs text-[#64748b]">••••</span>
              </IosGroupRow>

              {biometricAvailable && (
                <IosGroupRow className="gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <SettingsRowIcon icon={Fingerprint} className="bg-[#8b5cf6] text-white" />
                    <div className="min-w-0">
                      <p className="text-sm text-[#0f172a]">{t("appLock.biometricTitle")}</p>
                      <p className="text-xs text-[#64748b]">{t("appLock.biometricDesc")}</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.biometricEnabled}
                    onCheckedChange={(v) => void handleBiometricToggle(v)}
                    disabled={biometricLoading}
                  />
                </IosGroupRow>
              )}

              <div className="px-4 py-3.5 border-t border-[#e8e3d9]/60">
                <p className="text-sm text-[#0f172a] mb-2">{t("appLock.idleTimeout")}</p>
                <div className="flex flex-wrap gap-2">
                  {IDLE_OPTIONS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => setIdleMinutes(minutes)}
                      className={cn(
                        "text-xs font-semibold px-3 py-1.5 rounded-lg transition-all",
                        config.idleMinutes === minutes
                          ? "bg-[#1f75fe] text-white"
                          : "bg-[#f1ede4] text-[#64748b] hover:text-[#0f172a]",
                      )}
                    >
                      {minutes === 0 ? t("appLock.idleImmediate") : t("appLock.idleMinutes", { count: minutes })}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </IosGroup>
      </IosSection>

      <AppLockSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onSubmit={(pin) => void handleSetup(pin)}
        loading={setupLoading}
      />
    </>
  );
}
