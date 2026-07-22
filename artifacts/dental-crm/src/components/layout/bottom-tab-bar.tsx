import { useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  TabCalendarIcon,
  TabFinanceIcon,
  TabHomeIcon,
  TabInventoryIcon,
  TabWhatsAppIcon,
  TabProfileIcon,
  TabPatientsIcon,
  TabServicesIcon,
  TAB_ACTIVE,
} from "./bottom-tab-icons";
import { usesScheduleCalendar } from "@/lib/role-groups";
import { hrefToServiceSlug } from "@/lib/menu-services";
import { haptic } from "@/lib/haptics";

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
  /** Opens as ?service= overlay from the role dashboard */
  overlaySlug: string | null;
};

const ACCOUNT_SETTINGS_PREFIXES = [
  "/account-settings",
  "/account-edit-profile",
  "/account-change-email",
  "/account-change-password",
];

function getWorkTab(role: string): { labelKey: string; icon: TabIcon; href: string } {
  if (usesScheduleCalendar(role)) {
    return { labelKey: "nav.schedule", icon: TabCalendarIcon, href: "/schedule" };
  }
  switch (role) {
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

function parseActiveService(search: string): string | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return null;
  return new URLSearchParams(raw).get("service");
}

function buildTabs(
  role: string,
  roleDashboardHref: string,
  location: string,
  activeService: string | null,
): ResolvedTab[] {
  const work = getWorkTab(role);
  const workOverlaySlug = hrefToServiceSlug(work.href);

  const tabs: ResolvedTab[] = [
    {
      id: "home",
      labelKey: "nav.dashboard",
      href: roleDashboardHref,
      icon: TabHomeIcon,
      geoRestricted: false,
      isActive: location === roleDashboardHref && !activeService,
      overlaySlug: null,
    },
    {
      id: "work",
      labelKey: work.labelKey,
      href: work.href,
      icon: work.icon,
      geoRestricted: true,
      isActive:
        (workOverlaySlug != null && activeService === workOverlaySlug) ||
        (!activeService && matchesPath(location, work.href)),
      overlaySlug: workOverlaySlug,
    },
    {
      id: "services",
      labelKey: "nav.servicesHub",
      href: "/menu",
      icon: TabServicesIcon,
      geoRestricted: false,
      isActive: location === "/menu",
      overlaySlug: null,
    },
  ];

  if (role === "owner" || role === "doctor") {
    tabs.push({
      id: "chat",
      labelKey: "nav.chat",
      href: "/chat",
      icon: TabWhatsAppIcon,
      geoRestricted: true,
      isActive: matchesPath(location, "/chat"),
      overlaySlug: null,
    });
  }

  tabs.push({
    id: "more",
    labelKey: "nav.more",
    href: "/account-settings",
    icon: TabProfileIcon,
    geoRestricted: false,
    isActive: ACCOUNT_SETTINGS_PREFIXES.some((p) => matchesPath(location, p)),
    overlaySlug: null,
  });

  return tabs;
}

function isTabGeoBlocked(
  tab: ResolvedTab,
  role: string,
  isRestricted: boolean,
  hasBranches: boolean,
): boolean {
  if (!isRestricted || !hasBranches || !tab.geoRestricted) return false;
  // Owner + clinical staff keep schedule + WhatsApp chat when outside the clinic.
  if (tab.id === "work" && usesScheduleCalendar(role)) return false;
  if (tab.id === "chat") return false;
  return true;
}

export function BottomTabBar({
  roleDashboardHref,
  role,
  isRestricted,
  hasBranches,
}: BottomTabBarProps) {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const activeService = parseActiveService(search);

  const tabs = buildTabs(role, roleDashboardHref, location, activeService);

  const openWorkOverlay = (slug: string) => {
    haptic("light");
    navigate(`${roleDashboardHref}?service=${slug}`);
  };

  const navigateToTab = (href: string) => {
    haptic("light");
    navigate(href, { replace: activeService !== null });
  };

  useEffect(() => {
    void import("@/pages/account-settings");
    // Prefetch schedule chunks for roles that use the calendar tab — avoids a
    // blank sheet when a stale PWA shell races a fresh deploy.
    if (usesScheduleCalendar(role)) {
      void import("@/pages/doctor-schedule");
      void import("@/pages/doctor-schedule-day");
    }
  }, [role]);

  return (
    <nav className="flex-none bg-surface border-t border-border z-20 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-stretch h-16">
        {tabs.map((tab) => {
          const blocked = isTabGeoBlocked(tab, role, isRestricted, hasBranches);
          const Icon = tab.icon;
          const label = t(tab.labelKey);

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

          const content = (
            <>
              <Icon active={tab.isActive} />
              <span
                className={cn(
                  "text-[11px] font-medium leading-none truncate max-w-full",
                  tab.isActive ? "text-[#22c55e]" : "text-[var(--text-subtle)]",
                )}
                style={tab.isActive ? { color: TAB_ACTIVE } : undefined}
              >
                {label}
              </span>
            </>
          );

          if (tab.id === "work" && tab.overlaySlug) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => openWorkOverlay(tab.overlaySlug!)}
                className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 px-1 select-none transition-colors"
              >
                {content}
              </button>
            );
          }

          if (activeService !== null) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigateToTab(tab.href)}
                className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 px-1 select-none transition-colors"
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={tab.id}
              href={tab.href}
              onClick={() => haptic("light")}
              className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 px-1 select-none transition-colors"
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
