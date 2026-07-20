import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/hooks/use-auth";
import { prefetchStaffList } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/layout/page-shell";
import { RootTabHeader } from "@/components/layout/root-tab-header";
import { MENU_CATEGORIES, MENU_SERVICES, prefetchMenuIcons } from "@/lib/menu-services";
import { useOpenMenuService } from "@/components/layout/menu-service-overlay";
import { InstallAppCard } from "@/components/pwa/install-app";
import { AppIcon } from "@/components/ui/app-icon";

function CategoryCard({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: { slug: string; img: string; name: string }[];
  onOpen: (slug: string) => void;
}) {
  return (
    <section className="bg-white rounded-[20px] border border-[#e8e3d9] px-3 pt-4 pb-2 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <h2 className="px-2 mb-1 text-xs font-semibold text-[#64748b] uppercase tracking-wide">
        {title}
      </h2>
      <div className="grid grid-cols-3 sm:grid-cols-4">
        {items.map((item) => (
          <button
            key={item.slug}
            type="button"
            onClick={() => onOpen(item.slug)}
            className="flex flex-col items-center gap-2 pt-3 pb-3.5 px-1 rounded-2xl hover:bg-[#f1ede4] active:bg-[#f1ede4] active:scale-[0.97] transition-all"
          >
            <AppIcon src={item.img} size="lg" eager />
            <span className="w-full min-h-[26px] text-xs font-semibold text-[#0f172a] text-center leading-[1.2] line-clamp-2 break-words">
              {item.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function MenuPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const openService = useOpenMenuService();

  useEffect(() => {
    prefetchMenuIcons();
  }, []);

  useEffect(() => {
    if (user?.role !== "owner" && user?.role !== "admin") return;
    prefetchStaffList(queryClient);
  }, [user?.role, queryClient]);

  const navItems = MENU_SERVICES.filter(
    (item) =>
      item.showInMenu !== false && user && item.roles.includes(user.role),
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
        <InstallAppCard />
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
              onOpen={openService}
            />
          ))
        )}
      </div>
    </PageShell>
  );
}
