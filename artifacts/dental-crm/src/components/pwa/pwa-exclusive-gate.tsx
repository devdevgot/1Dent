import type { LucideIcon } from "lucide-react";
import { ArrowDownToLine, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IosGroup, IosSection } from "@/components/layout/ios-group";
import { usePwaInstall } from "@/lib/pwa";
import { useInstallAction } from "@/components/pwa/install-app";
import { cn } from "@/lib/utils";

type PwaExclusiveGateProps = {
  sectionTitle?: string;
  icon: LucideIcon;
  iconClassName: string;
  titleKey: string;
  descriptionKey: string;
  featureKeys: string[];
  children: React.ReactNode;
  /** Card layout for settings pages outside IosSection wrappers. */
  variant?: "section" | "card";
  className?: string;
};

function PwaExclusiveUpsell({
  icon: Icon,
  iconClassName,
  titleKey,
  descriptionKey,
  featureKeys,
  onInstall,
  className,
}: Omit<PwaExclusiveGateProps, "children" | "sectionTitle" | "variant"> & {
  onInstall: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[#dbe6ff] bg-gradient-to-br from-[#eef4ff] via-white to-[#faf8f4] p-4",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgba(31,117,254,0.18) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex items-start gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] shadow-sm",
            iconClassName,
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[#1f75fe]" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#1f75fe]">
              {t("pwa.exclusive.badge")}
            </span>
          </div>
          <p className="text-sm font-semibold text-[#0f172a]">{t(titleKey)}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#64748b]">{t(descriptionKey)}</p>
        </div>
      </div>

      <ul className="relative mt-3 space-y-1.5 pl-1">
        {featureKeys.map((key) => (
          <li key={key} className="flex items-start gap-2 text-xs text-[#475569]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f75fe]" />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onInstall}
        className="relative mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1f75fe] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(31,117,254,0.35)] transition-transform active:scale-[0.98]"
      >
        <ArrowDownToLine className="h-4 w-4" />
        {t("pwa.exclusive.installCta")}
      </button>
    </div>
  );
}

/**
 * Renders children only in the installed PWA. In the browser, shows an install
 * upsell to motivate adding 1Dent to the home screen.
 */
export function PwaExclusiveGate({
  sectionTitle,
  icon,
  iconClassName,
  titleKey,
  descriptionKey,
  featureKeys,
  children,
  variant = "section",
  className,
}: PwaExclusiveGateProps) {
  const { isStandalone } = usePwaInstall();
  const { run, dialog } = useInstallAction();

  if (isStandalone) {
    return <>{children}</>;
  }

  const upsell = (
    <PwaExclusiveUpsell
      icon={icon}
      iconClassName={iconClassName}
      titleKey={titleKey}
      descriptionKey={descriptionKey}
      featureKeys={featureKeys}
      onInstall={() => void run()}
      className={className}
    />
  );

  return (
    <>
      {variant === "section" && sectionTitle ? (
        <IosSection title={sectionTitle}>
          <IosGroup>{upsell}</IosGroup>
        </IosSection>
      ) : (
        upsell
      )}
      {dialog}
    </>
  );
}

export { PwaExclusiveUpsell };
