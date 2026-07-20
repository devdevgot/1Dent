import { type ComponentType } from "react";
import { CLINICAL_STAFF_ROLES } from "@/lib/role-groups";
import { lazyWithChunkRecovery } from "@/lib/chunk-reload";
import type { MenuServiceSkeletonVariant } from "@/components/skeletons/menu-service-content-skeleton";

export type MenuCategory = "clinic" | "finance" | "automation" | "admin" | "warehouse";

export type MenuServiceDefinition = {
  slug: string;
  nameKey: string;
  href: string;
  img: string;
  roles: string[];
  category: MenuCategory;
  component: React.LazyExoticComponent<ComponentType<Record<string, never>>>;
  skeletonVariant: MenuServiceSkeletonVariant;
  /** Hide from /menu category grid (still openable via overlay slug) */
  showInMenu?: boolean;
  supportsDetail?: boolean;
  supportsDate?: boolean;
};

const MENU_CATEGORIES: { key: MenuCategory; titleKey: string }[] = [
  { key: "clinic", titleKey: "menuPage.categoryClinic" },
  { key: "finance", titleKey: "menuPage.categoryFinance" },
  { key: "automation", titleKey: "menuPage.categoryAutomation" },
  { key: "admin", titleKey: "menuPage.categoryAdmin" },
  { key: "warehouse", titleKey: "menuPage.categoryWarehouse" },
];

export { MENU_CATEGORIES };

const CLINICAL = [...CLINICAL_STAFF_ROLES] as string[];

export const MENU_SERVICES: MenuServiceDefinition[] = [
  {
    slug: "warehouse-dashboard",
    nameKey: "nav.dashboard",
    href: "/dashboard/warehouse",
    img: "/icons/menu/dashboard.png",
    roles: ["warehouse"],
    category: "warehouse",
    component: lazyWithChunkRecovery(() => import("@/pages/dashboard-warehouse")),
    skeletonVariant: "dashboard",
  },
  {
    slug: "inventory",
    nameKey: "nav.inventory",
    href: "/inventory",
    img: "/icons/menu/inventory.png",
    roles: ["warehouse"],
    category: "warehouse",
    component: lazyWithChunkRecovery(() => import("@/pages/inventory")),
    skeletonVariant: "inventory",
  },
  {
    slug: "patients",
    nameKey: "nav.patients",
    href: "/patients",
    img: "/icons/menu/patients.png",
    roles: ["owner", "admin", ...CLINICAL, "accountant"],
    category: "clinic",
    component: lazyWithChunkRecovery(() => import("@/pages/patients")),
    skeletonVariant: "patients",
  },
  {
    slug: "schedule",
    nameKey: "nav.schedule",
    href: "/schedule",
    img: "/icons/menu/schedule.png",
    roles: ["owner", ...CLINICAL],
    category: "clinic",
    component: lazyWithChunkRecovery(() => import("@/pages/doctor-schedule")),
    skeletonVariant: "schedule",
    supportsDate: true,
  },
  {
    slug: "services",
    nameKey: "nav.services",
    href: "/services",
    img: "/icons/menu/services.png",
    roles: ["owner", "admin", ...CLINICAL, "accountant"],
    category: "clinic",
    component: lazyWithChunkRecovery(() => import("@/pages/services")),
    skeletonVariant: "services",
  },
  {
    slug: "users",
    nameKey: "nav.users",
    href: "/users",
    img: "/icons/menu/users.png",
    roles: ["owner", "admin"],
    category: "clinic",
    component: lazyWithChunkRecovery(() => import("@/pages/users")),
    skeletonVariant: "users",
    supportsDetail: true,
  },
  {
    slug: "doctor-ratings",
    nameKey: "staff.ratingsTitle",
    href: "/users/ratings",
    img: "/icons/menu/users.png",
    roles: ["owner", "admin"],
    category: "clinic",
    showInMenu: false,
    component: lazyWithChunkRecovery(() => import("@/pages/doctor-ratings")),
    skeletonVariant: "users",
    supportsDetail: true,
  },
  {
    slug: "clinic-branches",
    nameKey: "nav.clinicBranches",
    href: "/clinic-branches",
    img: "/icons/menu/clinic-branches.png",
    roles: ["owner"],
    category: "clinic",
    component: lazyWithChunkRecovery(() => import("@/pages/clinic-branches")),
    skeletonVariant: "form",
  },
  {
    slug: "contract-templates",
    nameKey: "nav.contractTemplates",
    href: "/contract-templates",
    img: "/icons/menu/contracts.png",
    roles: ["owner", "admin", "doctor"],
    category: "clinic",
    component: lazyWithChunkRecovery(() => import("@/pages/contract-templates")),
    skeletonVariant: "default",
  },
  {
    slug: "analytics",
    nameKey: "nav.analytics",
    href: "/analytics",
    img: "/icons/menu/analytics.png",
    roles: ["owner"],
    category: "finance",
    component: lazyWithChunkRecovery(() => import("@/pages/analytics")),
    skeletonVariant: "analytics",
  },
  {
    slug: "doctor-analytics",
    nameKey: "nav.myAnalytics",
    href: "/doctor-analytics",
    img: "/icons/menu/analytics.png",
    roles: ["doctor", "admin", "accountant", "warehouse", "assistant", "nurse"],
    category: "finance",
    component: lazyWithChunkRecovery(() => import("@/pages/staff-self-analytics-redirect")),
    skeletonVariant: "users",
  },
  {
    slug: "financials",
    nameKey: "nav.financials",
    href: "/financials",
    img: "/icons/menu/financials.png",
    roles: ["owner", "accountant"],
    category: "finance",
    component: lazyWithChunkRecovery(() => import("@/pages/financials")),
    skeletonVariant: "financials",
  },
  {
    slug: "pricing",
    nameKey: "nav.pricing",
    href: "/pricing",
    img: "/icons/menu/pricing.png",
    roles: ["owner"],
    category: "finance",
    component: lazyWithChunkRecovery(() => import("@/pages/pricing")),
    skeletonVariant: "form",
  },
  {
    slug: "chatbot",
    nameKey: "nav.chatbot",
    href: "/chatbot",
    img: "/icons/menu/chatbot.png",
    roles: ["owner"],
    category: "automation",
    component: lazyWithChunkRecovery(() => import("@/pages/chatbot")),
    skeletonVariant: "chatbot",
  },
  {
    slug: "channels",
    nameKey: "nav.channels",
    href: "/channels",
    img: "/icons/menu/channels.png",
    roles: ["owner", "admin"],
    category: "automation",
    component: lazyWithChunkRecovery(() => import("@/pages/channels")),
    skeletonVariant: "default",
  },
  {
    slug: "branches",
    nameKey: "nav.branches",
    href: "/branches",
    img: "/icons/menu/branches.png",
    roles: ["owner"],
    category: "automation",
    component: lazyWithChunkRecovery(() => import("@/pages/branches")),
    skeletonVariant: "form",
  },
  {
    slug: "migration",
    nameKey: "nav.migration",
    href: "/migration",
    img: "/icons/menu/migration.png",
    roles: ["owner"],
    category: "admin",
    component: lazyWithChunkRecovery(() => import("@/pages/migration")),
    skeletonVariant: "form",
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
  "schedule",
  "patients",
  "users",
  "services",
  "analytics",
  "financials",
  "chatbot",
  "contract-templates",
] as const;

/** Returns home tile slugs allowed for the given role. */
export function getHomeServiceSlugsForRole(role: string | undefined | null): readonly string[] {
  if (role === "owner") return HOME_SERVICE_SLUGS;
  if (role === "doctor") {
    return ["patients", "schedule", "services", "contract-templates", "doctor-analytics"];
  }
  if (role === "assistant" || role === "nurse") {
    return ["patients", "schedule", "services", "doctor-analytics"];
  }
  if (role === "admin" || role === "accountant" || role === "warehouse") {
    return ["patients", "schedule", "services", "doctor-analytics"];
  }
  if (!role) return [];
  return HOME_SERVICE_SLUGS.filter((slug) => {
    const service = MENU_SERVICES.find((s) => s.slug === slug);
    return service?.roles.includes(role);
  });
}

/** Prefetch unique menu 3D icons so Services/Home tiles don't flash empty. */
export function prefetchMenuIcons() {
  if (typeof window === "undefined") return;
  const seen = new Set<string>();
  for (const service of MENU_SERVICES) {
    if (seen.has(service.img)) continue;
    seen.add(service.img);
    const img = new Image();
    img.decoding = "async";
    img.src = service.img;
  }
}
