import { useState } from "react";
import { Camera, Loader2, MapPin, Mic } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";
import { isPwaStandalone } from "@/lib/pwa";

type GeoPermissionsPromptProps = {
  onAllow: (warmMedia: boolean) => Promise<boolean>;
  onDismiss: () => void;
};

export function GeoPermissionsPrompt({ onAllow, onDismiss }: GeoPermissionsPromptProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const inPwa = isPwaStandalone();

  const handleAllow = async () => {
    setLoading(true);
    try {
      await onAllow(inPwa);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppDialog
      open
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      title={t("permissions.geoPromptTitle")}
      size="sm"
    >
      <div className="space-y-4 px-1 pb-1">
        <p className="text-sm leading-relaxed text-[#64748b]">{t("permissions.geoPromptDesc")}</p>

        <ul className="space-y-2.5">
          <li className="flex items-start gap-3 rounded-xl border border-[#e8e4dc] bg-[#faf8f4] px-3 py-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1f75fe]/10 text-[#1f75fe]">
              <MapPin className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">{t("permissions.geoItemTitle")}</p>
              <p className="text-xs leading-relaxed text-[#64748b]">{t("permissions.geoItemDesc")}</p>
            </div>
          </li>

          {inPwa && (
            <>
              <li className="flex items-start gap-3 rounded-xl border border-[#e8e4dc] bg-white px-3 py-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#8b5cf6]/10 text-[#8b5cf6]">
                  <Camera className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#0f172a]">{t("permissions.cameraItemTitle")}</p>
                  <p className="text-xs leading-relaxed text-[#64748b]">{t("permissions.cameraItemDesc")}</p>
                </div>
              </li>
              <li className="flex items-start gap-3 rounded-xl border border-[#e8e4dc] bg-white px-3 py-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ec4899]/10 text-[#ec4899]">
                  <Mic className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#0f172a]">{t("permissions.micItemTitle")}</p>
                  <p className="text-xs leading-relaxed text-[#64748b]">{t("permissions.micItemDesc")}</p>
                </div>
              </li>
            </>
          )}
        </ul>

        <p className="text-xs leading-relaxed text-[#94a3b8]">{t("permissions.onceHint")}</p>

        <div className="flex flex-col gap-2 pt-1">
          <Button type="button" className="w-full" disabled={loading} onClick={() => void handleAllow()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("permissions.allowButton")}
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={loading} onClick={onDismiss}>
            {t("permissions.laterButton")}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
