import { useEffect } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/hooks/use-auth";
import { prefetchStaffList } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/layout/page-shell";
import { RootTabHeader } from "@/components/layout/root-tab-header";

type MenuCategory = "clinic" | "finance" | "automation" | "admin" | "warehouse";

const MENU_CATEGORIES: { key: MenuCategory; titleKey: string }[] = [
  { key: "clinic", titleKey: "menuPage.categoryClinic" },
  { key: "finance", titleKey: "menuPage.categoryFinance" },
  { key: "automation", titleKey: "menuPage.categoryAutomation" },
  { key: "admin", titleKey: "menuPage.categoryAdmin" },
  { key: "warehouse", titleKey: "menuPage.categoryWarehouse" },
];

const ALL_NAV_ITEMS: {
  nameKey: string;
  href: string;
  img: string;
  roles: string[];
  category: MenuCategory;
}[] = [
  { nameKey: "nav.dashboard", href: "/dashboard/warehouse", img: "/icons/menu/dashboard.png", roles: ["warehouse"], category: "warehouse" },
  { nameKey: "nav.inventory", href: "/inventory", img: "/icons/menu/inventory.png", roles: ["warehouse"], category: "warehouse" },
  { nameKey: "nav.patients", href: "/patients", img: "/icons/menu/patients.png", roles: ["owner", "admin", "doctor", "accountant"], category: "clinic" },
  { nameKey: "nav.schedule", href: "/schedule", img: "/icons/menu/schedule.png", roles: ["doctor"], category: "clinic" },
  { nameKey: "nav.services", href: "/services", img: "/icons/menu/services.png", roles: ["owner", "admin", "doctor", "accountant"], category: "clinic" },
  { nameKey: "nav.users", href: "/users", img: "/icons/menu/users.png", roles: ["owner"], category: "clinic" },
  { nameKey: "nav.clinicBranches", href: "/clinic-branches", img: "/icons/menu/clinic-branches.png", roles: ["owner"], category: "clinic" },
  { nameKey: "nav.contractTemplates", href: "/contract-templates", img: "/icons/menu/contracts.png", roles: ["owner", "admin", "doctor"], category: "clinic" },
  { nameKey: "nav.analytics", href: "/analytics", img: "/icons/menu/analytics.png", roles: ["owner"], category: "finance" },
  { nameKey: "nav.myAnalytics", href: "/doctor-analytics", img: "/icons/menu/analytics.png", roles: ["doctor"], category: "finance" },
  { nameKey: "nav.financials", href: "/financials", img: "/icons/menu/financials.png", roles: ["owner", "accountant"], category: "finance" },
  { nameKey: "nav.pricing", href: "/pricing", img: "/icons/menu/pricing.png", roles: ["owner"], category: "finance" },
  { nameKey: "nav.chatbot", href: "/chatbot", img: "/icons/menu/chatbot.png", roles: ["owner"], category: "automation" },
  { nameKey: "nav.channels", href: "/channels", img: "/icons/menu/channels.png", roles: ["owner", "admin"], category: "automation" },
  { nameKey: "nav.branches", href: "/branches", img: "/icons/menu/branches.png", roles: ["owner"], category: "automation" },
  { nameKey: "nav.migration", href: "/migration", img: "/icons/menu/migration.png", roles: ["owner"], category: "admin" },
];

function CategoryCard({
  title,
  items,
}: {
  title: string;
  items: { href: string; img: string; name: string }[];
}) {
  return (
    <section className="bg-white rounded-[20px] border border-[#e8e3d9] px-3 pt-4 pb-2 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <h2 className="px-2 mb-1 text-xs font-semibold text-[#64748b] uppercase tracking-wide">
        {title}
      </h2>
      <div className="grid grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-2 pt-3 pb-3.5 px-1 rounded-2xl hover:bg-[#f1ede4] active:bg-[#f1ede4] active:scale-[0.97] transition-all"
          >
            <img
              src={item.img}
              alt=""
              aria-hidden
              className="w-14 h-14 shrink-0 object-contain drop-shadow-sm"
              draggable={false}
            />
            <span className="w-full min-h-[26px] text-xs font-semibold text-[#0f172a] text-center leading-[1.2] line-clamp-2 break-words">
              {item.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function MenuPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user?.role !== "owner" && user?.role !== "admin") return;
    prefetchStaffList(queryClient);
  }, [user?.role, queryClient]);

  const navItems = ALL_NAV_ITEMS.filter((item) =>
    user && item.roles.includes(user.role),
  ).map((item) => ({
    ...item,
    name: t(item.nameKey),
  }));

  const categoriesWithItems = MENU_CATEGORIES.map((category) => ({
    ...category,
    items: navItems.filter((item) => item.category === category.key),
  })).filter((category) => category.items.length > 0);

  return (
    <PageShell className="pb-8">
      <RootTabHeader title={t("nav.servicesHub")} />

      <div className="px-4 pt-2 space-y-4">
        {categoriesWithItems.length === 0 ? (
          <p className="py-10 text-center text-xs text-[#94a3b8]">
            {t("menuPage.noShortcuts")}
          </p>
        ) : (
          categoriesWithItems.map((category) => (
            <CategoryCard
              key={category.key}
              title={t(category.titleKey)}
              items={category.items}
            />
          ))
        )}
      </div>
    </PageShell>
  );
}
