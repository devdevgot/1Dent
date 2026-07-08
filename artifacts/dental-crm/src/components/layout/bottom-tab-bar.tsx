import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  TabCalendarIcon,
  TabFinanceIcon,
  TabHomeIcon,
  TabInventoryIcon,
  TabMessagesIcon,
  TabMoreIcon,
  TabPatientsIcon,
  TabServicesIcon,
  TAB_ACTIVE,
} from "./bottom-tab-icons";

type BottomTabBarProps = {
  roleDashboardHref: string;
  role: string;
  isRestricted: boolean;
  hasBranches: boolean;
};

type TabContext = {
  location: string;
  roleDashboardHref: string;
  operationsHref: string;
};

type TabIcon = typeof TabHomeIcon;

type TabDef = {
  id: string;
  labelKey: string | ((role: string) => string);
  href: string | ((ctx: TabContext) => string);
  icon: TabIcon | ((role: string) => TabIcon);
  roles?: string[];
  geoRestricted?: boolean;
  isActive: (ctx: TabContext) => boolean;
};

const ACCOUNT_SETTINGS_PREFIXES = [
  "/account-settings",
  "/account-edit-profile",
  "/account-change-email",
  "/account-change-password",
];

function getOperationsHref(role: string): string {
  switch (role) {
    case "doctor":
      return "/schedule";
    case "accountant":
      return "/financials";
    case "warehouse":
      return "/inventory";
    default:
      return "/patients";
  }
}

function getOperationsTab(role: string): { labelKey: string; icon: TabIcon } {
  switch (role) {
    case "doctor":
      return { labelKey: "nav.schedule", icon: TabCalendarIcon };
    case "accountant":
      return { labelKey: "nav.financials", icon: TabFinanceIcon };
    case "warehouse":
      return { labelKey: "nav.inventory", icon: TabInventoryIcon };
    default:
      return { labelKey: "nav.patients", icon: TabPatientsIcon };
  }
}

const BOTTOM_TABS: TabDef[] = [
  {
    id: "home",
    labelKey: "nav.dashboard",
    href: (ctx) => ctx.roleDashboardHref,
    icon: TabHomeIcon,
    isActive: ({ location, roleDashboardHref }) =>
      location === roleDashboardHref || location.startsWith(`${roleDashboardHref}/`),
  },
  {
    id: "work",
    labelKey: (role) => getOperationsTab(role).labelKey,
    href: (ctx) => ctx.operationsHref,
    icon: (role) => getOperationsTab(role).icon,
    geoRestricted: true,
    isActive: ({ location, operationsHref }) =>
      location === operationsHref || location.startsWith(`${operationsHref}/`),
  },
  {
    id: "services",
    labelKey: "nav.servicesHub",
    href: "/menu",
    icon: TabServicesIcon,
    isActive: ({ location }) => location === "/menu",
  },
  {
    id: "messages",
    labelKey: "nav.messages",
    href: "/chat",
    icon: TabMessagesIcon,
    roles: ["owner", "doctor"],
    geoRestricted: true,
    isActive: ({ location }) => location === "/chat" || location.startsWith("/chat/"),
  },
  {
    id: "more",
    labelKey: "nav.more",
    href: "/account-settings",
    icon: TabMoreIcon,
    isActive: ({ location }) =>
      ACCOUNT_SETTINGS_PREFIXES.some((p) => location === p || location.startsWith(`${p}/`)),
  },
];

function resolveHref(tab: TabDef, ctx: TabContext): string {
  return typeof tab.href === "function" ? tab.href(ctx) : tab.href;
}

function resolveLabelKey(tab: TabDef, role: string): string {
  return typeof tab.labelKey === "function" ? tab.labelKey(role) : tab.labelKey;
}

function resolveIcon(tab: TabDef, role: string): TabIcon {
  return typeof tab.icon === "function" ? tab.icon(role) : tab.icon;
}

export function BottomTabBar({
  roleDashboardHref,
  role,
  isRestricted,
  hasBranches,
}: BottomTabBarProps) {
  const { t } = useTranslation();
  const [location] = useLocation();

  const ctx: TabContext = {
    location,
    roleDashboardHref,
    operationsHref: getOperationsHref(role),
  };

  const tabs = BOTTOM_TABS.filter((tab) => !tab.roles || tab.roles.includes(role));

  return (
    <nav className="flex-none bg-[var(--ds-surface)] border-t border-[var(--ds-border)] z-20 safe-area-bottom">
      <div className="flex items-stretch h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)]">
        {tabs.map((tab) => {
          const href = resolveHref(tab, ctx);
          const isActive = tab.isActive(ctx);
          const blocked = isRestricted && hasBranches && tab.geoRestricted;
          const Icon = resolveIcon(tab, role);
          const label = t(resolveLabelKey(tab, role));

          if (blocked) {
            return (
              <div
                key={tab.id}
                className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 px-1 select-none opacity-35"
              >
                <Icon active={false} />
                <span className="text-[11px] font-medium leading-none text-[var(--text-subtle)] truncate max-w-full">
                  {label}
                </span>
              </div>
            );
          }

          return (
            <Link
              key={tab.id}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 px-1 select-none transition-colors"
            >
              <Icon active={isActive} />
              <span
                className={cn(
                  "text-[11px] font-medium leading-none truncate max-w-full",
                  isActive ? "text-[#22c55e]" : "text-[var(--text-subtle)]",
                )}
                style={isActive ? { color: TAB_ACTIVE } : undefined}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
