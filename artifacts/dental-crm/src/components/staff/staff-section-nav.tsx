import { Link } from "wouter";
import { Users, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";

type StaffTab = "list" | "ratings";

const TABS: {
  key: StaffTab;
  slug: string;
  href: string;
  icon: typeof Users;
}[] = [
  { key: "list", slug: "users", href: "/users", icon: Users },
  { key: "ratings", slug: "doctor-ratings", href: "/users/ratings", icon: Trophy },
];

export function StaffSectionNav({ active }: { active: StaffTab }) {
  const { t } = useTranslation();
  const { isOverlay, activeSlug, openService } = useOverlayNavigation();

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none">
      {TABS.map((tab) => {
        const isActive =
          tab.key === active ||
          (isOverlay ? activeSlug === tab.slug : false);
        const Icon = tab.icon;

        const className = cn(
          "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-200",
          isActive
            ? "bg-[var(--ds-primary)] text-white border-[var(--ds-primary)] shadow-md"
            : "bg-white text-[#64748b] border-[#e8e3d9] hover:border-[var(--ds-primary)]/30 hover:text-[#1f75fe] hover:bg-[var(--ds-primary)]/5",
        );

        const label =
          tab.key === "list"
            ? t("staff.tabList", "Сотрудники")
            : t("staff.tabRatings", "Рейтинг врачей");

        if (isOverlay) {
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => openService(tab.slug, true)}
              className={className}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        }

        return (
          <Link key={tab.key} href={tab.href} className={className}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
