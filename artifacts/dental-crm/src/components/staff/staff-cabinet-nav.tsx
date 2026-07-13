import { Link } from "wouter";
import { Wallet, BarChart2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";

type StaffCabinetTab = "profile" | "analytics";

const TABS: {
  key: StaffCabinetTab;
  icon: typeof Wallet;
}[] = [
  { key: "profile", icon: Wallet },
  { key: "analytics", icon: BarChart2 },
];

export function StaffCabinetNav({
  doctorId,
  active,
}: {
  doctorId: string;
  active: StaffCabinetTab;
}) {
  const { t } = useTranslation();
  const { isOverlay, detailId, pushStaffTab } = useOverlayNavigation();

  const label = (tab: StaffCabinetTab) =>
    tab === "profile"
      ? t("staff.cabinetProfile", "ФОТ")
      : t("employees.analytics", "Аналитика");

  const href = (tab: StaffCabinetTab) =>
    tab === "profile"
      ? `/users/${doctorId}`
      : `/users/${doctorId}/analytics`;

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none">
      {TABS.map((tab) => {
        const isActive =
          tab.key === active ||
          (isOverlay && detailId === doctorId && tab.key === active);
        const Icon = tab.icon;

        const className = cn(
          "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-200",
          isActive
            ? "bg-[var(--ds-primary)] text-white border-[var(--ds-primary)] shadow-md"
            : "bg-white text-[#64748b] border-[#e8e3d9] hover:border-[var(--ds-primary)]/30 hover:text-[#1f75fe] hover:bg-[var(--ds-primary)]/5",
        );

        if (isOverlay) {
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => pushStaffTab(doctorId, tab.key)}
              className={className}
            >
              <Icon className="w-3.5 h-3.5" />
              {label(tab.key)}
            </button>
          );
        }

        return (
          <Link key={tab.key} href={href(tab.key)} className={className}>
            <Icon className="w-3.5 h-3.5" />
            {label(tab.key)}
          </Link>
        );
      })}
    </div>
  );
}