import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownToLine,
  Check,
  Download,
  Plus,
  Share,
  MoreVertical,
  X,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePwaInstall } from "@/lib/pwa";
import { cn } from "@/lib/utils";

/** Step-by-step manual install instructions (iOS Safari / other browsers). */
export function InstallInstructionsDialog({
  open,
  onOpenChange,
  variant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: "ios" | "generic";
}) {
  const { t } = useTranslation();

  const steps =
    variant === "ios"
      ? [
          { icon: <Share className="h-5 w-5" />, text: t("pwa.iosStep1") },
          { icon: <Plus className="h-5 w-5" />, text: t("pwa.iosStep2") },
          { icon: <Check className="h-5 w-5" />, text: t("pwa.iosStep3") },
        ]
      : [
          { icon: <MoreVertical className="h-5 w-5" />, text: t("pwa.genericStep1") },
          { icon: <Download className="h-5 w-5" />, text: t("pwa.genericStep2") },
          { icon: <Check className="h-5 w-5" />, text: t("pwa.genericStep3") },
        ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-0 overflow-hidden font-manrope">
        <div className="flex flex-col items-center gap-3 bg-[#1f75fe] px-6 pb-6 pt-8 text-center text-white">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <ArrowDownToLine className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-bold">
            {variant === "ios" ? t("pwa.iosTitle") : t("pwa.genericTitle")}
          </h2>
          <p className="text-sm text-white/85">
            {variant === "ios" ? t("pwa.iosSubtitle") : t("pwa.genericSubtitle")}
          </p>
        </div>

        <ol className="flex flex-col gap-3 px-6 py-6">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef4ff] text-[#1f75fe]">
                {step.icon}
              </span>
              <span className="flex-1 text-sm leading-snug text-[#0f172a]">
                {step.text}
              </span>
            </li>
          ))}
        </ol>

        {variant === "ios" ? (
          <p className="px-6 pb-4 text-xs leading-relaxed text-[#94a3b8]">
            {t("pwa.iosSafariHint")}
          </p>
        ) : null}

        <div className="border-t border-[#e8e3d9] px-6 py-4">
          <Button
            type="button"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            {t("pwa.gotIt")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Shared click handler: native prompt when available, otherwise manual steps. */
function useInstallAction() {
  const { canPrompt, isIos, promptInstall } = usePwaInstall();
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const run = useCallback(async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        toast({ title: t("pwa.success"), description: t("pwa.successDesc") });
        return;
      }
      if (outcome !== "unavailable") return;
    }
    setInstructionsOpen(true);
  }, [canPrompt, promptInstall, toast, t]);

  const dialog = (
    <InstallInstructionsDialog
      open={instructionsOpen}
      onOpenChange={setInstructionsOpen}
      variant={isIos ? "ios" : "generic"}
    />
  );

  return { run, dialog };
}

/** Compact install button. Renders nothing when already installed. */
export function InstallAppButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { canInstall } = usePwaInstall();
  const { run, dialog } = useInstallAction();

  if (!canInstall) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn("gap-2", className)}
        onClick={() => void run()}
      >
        <ArrowDownToLine className="h-4 w-4" />
        {t("pwa.install")}
      </Button>
      {dialog}
    </>
  );
}

/** Rich install card for the services/menu screen. Hidden once installed. */
export function InstallAppCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { canInstall } = usePwaInstall();
  const { run, dialog } = useInstallAction();

  if (!canInstall) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void run()}
        className={cn(
          "flex w-full items-center gap-4 rounded-[20px] border border-[#dbe6ff] bg-gradient-to-br from-[#eef4ff] to-white px-4 py-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all active:scale-[0.99]",
          className,
        )}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1f75fe] text-white shadow-sm">
          <ArrowDownToLine className="h-6 w-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold text-[#0f172a]">
            {t("pwa.cardTitle")}
          </span>
          <span className="mt-0.5 text-xs leading-snug text-[#64748b]">
            {t("pwa.cardSubtitle")}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-[#1f75fe] px-3 py-1.5 text-xs font-semibold text-white">
          {t("pwa.installShort")}
        </span>
      </button>
      {dialog}
    </>
  );
}

const DISMISS_KEY = "1dent:pwa-install-dismissed";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // re-offer after 14 days

function isBannerDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Auto-surfaced, dismissible install banner — mirrors the native "install app"
 * nudge. Remembers dismissal for two weeks. Hidden when already installed.
 */
export function InstallAppBanner({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { canInstall } = usePwaInstall();
  const { run, dialog } = useInstallAction();
  const [dismissed, setDismissed] = useState(() => isBannerDismissed());

  if (!canInstall || dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore storage failures
    }
    setDismissed(true);
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-[#dbe6ff] bg-white px-3 py-3 shadow-[0_4px_20px_rgba(31,117,254,0.10)] font-manrope",
          className,
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1f75fe] text-white">
          <ArrowDownToLine className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#0f172a]">
            {t("pwa.bannerTitle")}
          </p>
          <p className="truncate text-xs text-[#64748b]">
            {t("pwa.bannerSubtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          className="shrink-0 rounded-full bg-[#1f75fe] px-3.5 py-2 text-xs font-semibold text-white active:scale-95"
        >
          {t("pwa.installShort")}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("pwa.later")}
          className="shrink-0 rounded-full p-1.5 text-[#94a3b8] hover:bg-[#f1ede4]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {dialog}
    </>
  );
}
