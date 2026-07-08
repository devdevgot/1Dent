import { useEffect } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/hooks/use-auth";
import { prefetchStaffList } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { IosGroup, IosSection } from "@/components/layout/ios-group";

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

function MenuTileGrid({ items }: { items: { href: string; img: string; name: string }[] }) {
  return (
    <IosGroup className="py-2 px-1">
      <div className="grid grid-cols-4">
        {items.map((item) => (
          <div key={item.href}>
            <Link
              href={item.href}
              className="flex flex-col items-center gap-1.5 py-3 px-0.5 rounded-xl hover:bg-[#f1ede4] active:bg-[#f1ede4] transition-colors"
            >
              <img
                src={item.img}
                alt=""
                aria-hidden
                className="w-[52px] h-[52px] shrink-0 object-contain drop-shadow-sm"
                draggable={false}
              />
              <span className="w-full text-[10px] font-bold text-[#0f172a] text-center leading-[1.2] line-clamp-2 break-words">
                {item.name}
              </span>
            </Link>
          </div>
        ))}
      </div>
    </IosGroup>
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
    <PageShell className="pb-6">
      <PageHeader title={t("nav.servicesHub")} sticky />

      {categoriesWithItems.length === 0 ? (
        <IosSection className="mt-4">
          <p className="py-8 text-center text-caption text-[#94a3b8]">
            {t("menuPage.noShortcuts")}
          </p>
        </IosSection>
      ) : (
        categoriesWithItems.map((category) => (
          <IosSection key={category.key} title={t(category.titleKey)} className="mb-5">
            <MenuTileGrid items={category.items} />
          </IosSection>
        ))
      )}
    </PageShell>
  );
}
