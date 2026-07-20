import { useTranslation } from "react-i18next";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "@/hooks/use-theme";

const OPTIONS: { value: Theme; icon: typeof Sun; labelKey: string }[] = [
  { value: "light", icon: Sun, labelKey: "settingsPage.themeLight" },
  { value: "dark", icon: Moon, labelKey: "settingsPage.themeDark" },
  { value: "system", icon: Monitor, labelKey: "settingsPage.themeSystem" },
];

type ThemePickerProps = {
  className?: string;
  /** Compact segmented control (account settings row). */
  compact?: boolean;
};

export function ThemePicker({ className, compact = false }: ThemePickerProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  if (compact) {
    return (
      <div
        className={cn(
          "flex bg-[#f1ede4] rounded-lg p-0.5 shrink-0 ml-auto",
          className,
        )}
        role="group"
        aria-label={t("settingsPage.appearance")}
      >
        {OPTIONS.map(({ value, icon: Icon, labelKey }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              title={t(labelKey)}
              aria-label={t(labelKey)}
              aria-pressed={active}
              className={cn(
                "min-w-[2.25rem] inline-flex items-center justify-center px-2 py-1 rounded-md transition-all",
                active
                  ? "bg-white text-[#1f75fe] shadow-sm"
                  : "text-[#64748b] hover:text-[#0f172a]",
              )}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2", className)} role="group" aria-label={t("settingsPage.appearance")}>
      {OPTIONS.map(({ value, icon: Icon, labelKey }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={cn(
              "flex-1 h-10 rounded-xl border text-sm font-semibold transition-all inline-flex items-center justify-center gap-1.5",
              active
                ? "border-[#1f75fe] bg-[#1f75fe]/10 text-[#1f75fe]"
                : "border-[#e8e3d9] bg-white text-[#64748b] hover:border-[#1f75fe]/40",
            )}
          >
            <Icon className="w-4 h-4 shrink-0" strokeWidth={2.25} />
            <span className="truncate">{t(labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
