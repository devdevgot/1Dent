import { Link, useLocation } from "wouter";
import { Users, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type StaffTab = "list" | "ratings";

const TABS: { key: StaffTab; href: string; icon: typeof Users }[] = [
  { key: "list", href: "/users", icon: Users },
  { key: "ratings", href: "/users/ratings", icon: Trophy },
];

export function StaffSectionNav({ active }: { active: StaffTab }) {
  const { t } = useTranslation();
  const [location] = useLocation();

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none">
      {TABS.map((tab) => {
        const isActive = tab.key === active || location === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-200",
              isActive
                ? "bg-[var(--ds-primary)] text-white border-[var(--ds-primary)] shadow-md"
                : "bg-white text-[#64748b] border-[#e8e3d9] hover:border-[var(--ds-primary)]/30 hover:text-[#1f75fe] hover:bg-[var(--ds-primary)]/5",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {tab.key === "list"
              ? t("staff.tabList", "Сотрудники")
              : t("staff.tabRatings", "Рейтинг врачей")}
          </Link>
        );
      })}
    </div>
  );
}
