import { lazy, type ComponentType } from "react";
import {
  AnalyticsPageSkeleton,
  BranchesPageSkeleton,
  ChannelsPageSkeleton,
  ChatbotPageSkeleton,
  ClinicBranchesPageSkeleton,
  ContractTemplatesPageSkeleton,
  DoctorAnalyticsPageSkeleton,
  DoctorSchedulePageSkeleton,
  FinancialsPageSkeleton,
  InventoryPageSkeleton,
  MigrationPageSkeleton,
  ServicesPageSkeleton,
  UsersPageSkeleton,
  WarehouseDashboardSkeleton,
  AppShellSkeleton,
} from "@/components/skeletons";

export type MenuCategory = "clinic" | "finance" | "automation" | "admin" | "warehouse";

export type MenuServiceDefinition = {
  slug: string;
  nameKey: string;
  href: string;
  img: string;
  roles: string[];
  category: MenuCategory;
  component: React.LazyExoticComponent<ComponentType<Record<string, never>>>;
  Skeleton: ComponentType;
};

const MENU_CATEGORIES: { key: MenuCategory; titleKey: string }[] = [
  { key: "clinic", titleKey: "menuPage.categoryClinic" },
  { key: "finance", titleKey: "menuPage.categoryFinance" },
  { key: "automation", titleKey: "menuPage.categoryAutomation" },
  { key: "admin", titleKey: "menuPage.categoryAdmin" },
  { key: "warehouse", titleKey: "menuPage.categoryWarehouse" },
];

export { MENU_CATEGORIES };

export const MENU_SERVICES: MenuServiceDefinition[] = [
  {
    slug: "warehouse-dashboard",
    nameKey: "nav.dashboard",
    href: "/dashboard/warehouse",
    img: "/icons/menu/dashboard.png",
    roles: ["warehouse"],
    category: "warehouse",
    component: lazy(() => import("@/pages/dashboard-warehouse")),
    Skeleton: WarehouseDashboardSkeleton,
  },
  {
    slug: "inventory",
    nameKey: "nav.inventory",
    href: "/inventory",
    img: "/icons/menu/inventory.png",
    roles: ["warehouse"],
    category: "warehouse",
    component: lazy(() => import("@/pages/inventory")),
    Skeleton: InventoryPageSkeleton,
  },
  {
    slug: "patients",
    nameKey: "nav.patients",
    href: "/patients",
    img: "/icons/menu/patients.png",
    roles: ["owner", "admin", "doctor", "accountant"],
    category: "clinic",
    component: lazy(() => import("@/pages/patients")),
    Skeleton: AppShellSkeleton,
  },
  {
    slug: "schedule",
    nameKey: "nav.schedule",
    href: "/schedule",
    img: "/icons/menu/schedule.png",
    roles: ["doctor"],
    category: "clinic",
    component: lazy(() => import("@/pages/doctor-schedule")),
    Skeleton: DoctorSchedulePageSkeleton,
  },
  {
    slug: "services",
    nameKey: "nav.services",
    href: "/services",
    img: "/icons/menu/services.png",
    roles: ["owner", "admin", "doctor", "accountant"],
    category: "clinic",
    component: lazy(() => import("@/pages/services")),
    Skeleton: ServicesPageSkeleton,
  },
  {
    slug: "users",
    nameKey: "nav.users",
    href: "/users",
    img: "/icons/menu/users.png",
    roles: ["owner"],
    category: "clinic",
    component: lazy(() => import("@/pages/users")),
    Skeleton: UsersPageSkeleton,
  },
  {
    slug: "clinic-branches",
    nameKey: "nav.clinicBranches",
    href: "/clinic-branches",
    img: "/icons/menu/clinic-branches.png",
    roles: ["owner"],
    category: "clinic",
    component: lazy(() => import("@/pages/clinic-branches")),
    Skeleton: ClinicBranchesPageSkeleton,
  },
  {
    slug: "contract-templates",
    nameKey: "nav.contractTemplates",
    href: "/contract-templates",
    img: "/icons/menu/contracts.png",
    roles: ["owner", "admin", "doctor"],
    category: "clinic",
    component: lazy(() => import("@/pages/contract-templates")),
    Skeleton: ContractTemplatesPageSkeleton,
  },
  {
    slug: "analytics",
    nameKey: "nav.analytics",
    href: "/analytics",
    img: "/icons/menu/analytics.png",
    roles: ["owner"],
    category: "finance",
    component: lazy(() => import("@/pages/analytics")),
    Skeleton: AnalyticsPageSkeleton,
  },
  {
    slug: "doctor-analytics",
    nameKey: "nav.myAnalytics",
    href: "/doctor-analytics",
    img: "/icons/menu/analytics.png",
    roles: ["doctor"],
    category: "finance",
    component: lazy(() => import("@/pages/doctor-analytics")),
    Skeleton: DoctorAnalyticsPageSkeleton,
  },
  {
    slug: "financials",
    nameKey: "nav.financials",
    href: "/financials",
    img: "/icons/menu/financials.png",
    roles: ["owner", "accountant"],
    category: "finance",
    component: lazy(() => import("@/pages/financials")),
    Skeleton: FinancialsPageSkeleton,
  },
  {
    slug: "pricing",
    nameKey: "nav.pricing",
    href: "/pricing",
    img: "/icons/menu/pricing.png",
    roles: ["owner"],
    category: "finance",
    component: lazy(() => import("@/pages/pricing")),
    Skeleton: AppShellSkeleton,
  },
  {
    slug: "chatbot",
    nameKey: "nav.chatbot",
    href: "/chatbot",
    img: "/icons/menu/chatbot.png",
    roles: ["owner"],
    category: "automation",
    component: lazy(() => import("@/pages/chatbot")),
    Skeleton: ChatbotPageSkeleton,
  },
  {
    slug: "channels",
    nameKey: "nav.channels",
    href: "/channels",
    img: "/icons/menu/channels.png",
    roles: ["owner", "admin"],
    category: "automation",
    component: lazy(() => import("@/pages/channels")),
    Skeleton: ChannelsPageSkeleton,
  },
  {
    slug: "branches",
    nameKey: "nav.branches",
    href: "/branches",
    img: "/icons/menu/branches.png",
    roles: ["owner"],
    category: "automation",
    component: lazy(() => import("@/pages/branches")),
    Skeleton: BranchesPageSkeleton,
  },
  {
    slug: "migration",
    nameKey: "nav.migration",
    href: "/migration",
    img: "/icons/menu/migration.png",
    roles: ["owner"],
    category: "admin",
    component: lazy(() => import("@/pages/migration")),
    Skeleton: MigrationPageSkeleton,
  },
];

const bySlug = new Map(MENU_SERVICES.map((s) => [s.slug, s]));

export function getMenuServiceBySlug(slug: string | null | undefined): MenuServiceDefinition | null {
  if (!slug) return null;
  return bySlug.get(slug) ?? null;
}

export function hrefToServiceSlug(href: string): string | null {
  const match = MENU_SERVICES.find((s) => s.href === href);
  return match?.slug ?? null;
}

/** Dashboard home quick-access tiles (subset of menu services). */
export const HOME_SERVICE_SLUGS = [
  "patients",
  "users",
  "services",
  "analytics",
  "financials",
  "chatbot",
  "contract-templates",
] as const;
