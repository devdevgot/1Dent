import { useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { usePwaInstall } from "@/lib/pwa";
import { useInstallAction } from "@/components/pwa/install-app";
import { PwaExclusiveUpsell } from "@/components/pwa/pwa-exclusive-gate";
import { isPushSupported, sendTestPush } from "@/lib/push-notifications";

const TRACKING_PUSH_FEATURES = [
  "pwa.exclusive.pushFeature1",
  "pwa.exclusive.pushFeature2",
  "pwa.exclusive.pushFeature3",
] as const;

export function TrackingPushTestSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isStandalone } = usePwaInstall();
  const { run, dialog } = useInstallAction();
  const [testingPush, setTestingPush] = useState(false);

  if (!isPushSupported()) return null;

  const handleTestPush = async () => {
    setTestingPush(true);
    try {
      await sendTestPush("tracking");
      toast({
        title: t("push.trackingTestSent"),
        description: t("push.trackingTestSentDesc"),
      });
    } catch (err) {
      toast({
        title: t("push.trackingTestFailed"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setTestingPush(false);
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-[#e8e3d9] bg-white">
        <div className="flex items-center gap-3 border-b border-[#e8e3d9] px-5 py-4">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-[#0f172a]">{t("push.trackingSectionTitle")}</h2>
            <p className="mt-0.5 text-xs text-[#64748b]">{t("push.trackingSectionDesc")}</p>
          </div>
        </div>
        <div className="space-y-3 p-5">
          {isStandalone ? (
            <>
              <p className="text-xs leading-relaxed text-[#64748b]">{t("push.trackingEnableHint")}</p>
              <button
                type="button"
                onClick={() => void handleTestPush()}
                disabled={testingPush}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-[#e8e3d9] text-sm text-[#64748b] transition-colors hover:border-[var(--ds-primary)]/40 hover:text-[#1f75fe] disabled:opacity-50"
              >
                {testingPush ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                {t("push.trackingTestButton")}
              </button>
            </>
          ) : (
            <PwaExclusiveUpsell
              icon={BellRing}
              iconClassName="bg-[#ec4899] text-white"
              titleKey="pwa.exclusive.trackingPushTitle"
              descriptionKey="pwa.exclusive.trackingPushDesc"
              featureKeys={[...TRACKING_PUSH_FEATURES]}
              onInstall={() => void run()}
            />
          )}
        </div>
      </div>
      {dialog}
    </>
  );
}
