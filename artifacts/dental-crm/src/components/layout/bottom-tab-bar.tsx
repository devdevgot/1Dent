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

type TabIcon = typeof TabHomeIcon;

type ResolvedTab = {
  id: string;
  labelKey: string;
  href: string;
  icon: TabIcon;
  geoRestricted: boolean;
  isActive: boolean;
};

const ACCOUNT_SETTINGS_PREFIXES = [
  "/account-settings",
  "/account-edit-profile",
  "/account-change-email",
  "/account-change-password",
];

function getWorkTab(role: string): { labelKey: string; icon: TabIcon; href: string } {
  switch (role) {
    case "doctor":
      return { labelKey: "nav.schedule", icon: TabCalendarIcon, href: "/schedule" };
    case "accountant":
      return { labelKey: "nav.financials", icon: TabFinanceIcon, href: "/financials" };
    case "warehouse":
      return { labelKey: "nav.inventory", icon: TabInventoryIcon, href: "/inventory" };
    default:
      return { labelKey: "nav.patients", icon: TabPatientsIcon, href: "/patients" };
  }
}

function matchesPath(location: string, href: string): boolean {
  return location === href || location.startsWith(`${href}/`);
}

function buildTabs(role: string, roleDashboardHref: string, location: string): ResolvedTab[] {
  const work = getWorkTab(role);

  const tabs: ResolvedTab[] = [
    {
      id: "home",
      labelKey: "nav.dashboard",
      href: roleDashboardHref,
      icon: TabHomeIcon,
      geoRestricted: false,
      isActive: matchesPath(location, roleDashboardHref),
    },
    {
      id: "work",
      labelKey: work.labelKey,
      href: work.href,
      icon: work.icon,
      geoRestricted: true,
      isActive: matchesPath(location, work.href),
    },
    {
      id: "services",
      labelKey: "nav.servicesHub",
      href: "/menu",
      icon: TabServicesIcon,
      geoRestricted: false,
      isActive: location === "/menu",
    },
  ];

  if (role === "owner" || role === "doctor") {
    tabs.push({
      id: "messages",
      labelKey: "nav.messages",
      href: "/chat",
      icon: TabMessagesIcon,
      geoRestricted: true,
      isActive: matchesPath(location, "/chat"),
    });
  }

  tabs.push({
    id: "more",
    labelKey: "nav.more",
    href: "/account-settings",
    icon: TabMoreIcon,
    geoRestricted: false,
    isActive: ACCOUNT_SETTINGS_PREFIXES.some((p) => matchesPath(location, p)),
  });

  return tabs;
}

export function BottomTabBar({
  roleDashboardHref,
  role,
  isRestricted,
  hasBranches,
}: BottomTabBarProps) {
  const { t } = useTranslation();
  const [location] = useLocation();

  const tabs = buildTabs(role, roleDashboardHref, location);

  return (
    <nav className="flex-none bg-[var(--ds-surface)] border-t border-[var(--ds-border)] z-20 safe-area-bottom">
      <div className="flex items-stretch h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)]">
        {tabs.map((tab) => {
          const blocked = isRestricted && hasBranches && tab.geoRestricted;
          const Icon = tab.icon;
          const label = t(tab.labelKey);

          if (blocked) {
            return (
              <div
                key={tab.id}
                className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 px-1 select-none opacity-35"
              >
                <Icon active={false} />
                <span className="text-micro font-medium leading-none text-[var(--text-subtle)] truncate max-w-full">
                  {label}
                </span>
              </div>
            );
          }

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 px-1 select-none transition-colors"
            >
              <Icon active={tab.isActive} />
              <span
                className={cn(
                  "text-micro font-medium leading-none truncate max-w-full",
                  tab.isActive ? "text-[#22c55e]" : "text-[var(--text-subtle)]",
                )}
                style={tab.isActive ? { color: TAB_ACTIVE } : undefined}
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
