import { ReactNode, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { NotificationBell } from "./notification-bell";
import { GlobalSearch } from "./global-search";
import { AppointmentReminderModal } from "./appointment-reminder-modal";
import { AttendanceCheckModal } from "./attendance-check-modal";
import { useBranchStore } from "@/hooks/use-branch-store";
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  BarChart3,
  Contact,
  Activity,
  Calendar,
  Wallet,
  Bot,
  MoreHorizontal,
  MapPin,
  AlertTriangle,
  Building2,
  ChevronDown,
  Check,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { prefetchStaffList } from "@workspace/api-client-react";
import { TabletScannerSlot } from "@/components/tablet/tablet-scanner-slot";

const ROLE_DASHBOARD_HREF: Record<string, string> = {
  owner:      "/dashboard",
  admin:      "/dashboard/admin",
  doctor:     "/dashboard/doctor",
  accountant: "/dashboard/accountant",
  warehouse:  "/dashboard/warehouse",
};

const MAX_BOTTOM_TABS = 3;

const ALL_NAV_ITEMS = [
  { nameKey: "nav.dashboard",   href: "__role_dashboard__",  icon: LayoutDashboard, roles: ["owner","admin","doctor","accountant","warehouse"], geoRestricted: false },
  { nameKey: "nav.calendar",    href: "/calendar",           icon: Calendar,        roles: ["owner"],                                           geoRestricted: false },
  { nameKey: "nav.chat",        href: "/chat",               icon: FaWhatsapp,      roles: ["owner","admin","doctor"],                          geoRestricted: true  },
  { nameKey: "nav.patients",    href: "/patients",           icon: Users,           roles: ["owner","admin","doctor","accountant"],             geoRestricted: true  },
  { nameKey: "nav.schedule",    href: "/schedule",           icon: Calendar,        roles: ["doctor"],                                          geoRestricted: false },
  { nameKey: "nav.services",    href: "/services",           icon: Stethoscope,     roles: ["owner","admin"],                                   geoRestricted: true  },
  { nameKey: "nav.analytics",   href: "/analytics",          icon: BarChart3,       roles: ["owner"],                                           geoRestricted: true  },
  { nameKey: "nav.myAnalytics", href: "/doctor-analytics",   icon: BarChart3,       roles: ["doctor"],                                          geoRestricted: true  },
  { nameKey: "nav.financials",  href: "/financials",         icon: Wallet,          roles: ["owner","accountant"],                              geoRestricted: true  },
  { nameKey: "nav.users",       href: "/users",              icon: Contact,         roles: ["owner", "admin"],                                  geoRestricted: true  },
  { nameKey: "nav.chatbot",     href: "/chatbot",            icon: Bot,             roles: ["owner"],                                           geoRestricted: true  },
  { nameKey: "nav.logs",        href: "/logs",               icon: Activity,        roles: ["owner"],                                           geoRestricted: false },
];

// Routes that are off-limits outside geo-zone (for non-owners)
const GEO_RESTRICTED_PREFIXES = [
  "/patients", "/chat", "/analytics", "/doctor-analytics",
  "/financials", "/services", "/inventory", "/warehouse",
  "/users", "/chatbot", "/staff", "/channels",
  "/migration", "/contract-templates",
];

function isGeoRestrictedPath(path: string) {
  return GEO_RESTRICTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [location] = useLocation();
  const { status, activeBranch, isRestricted, hasBranches } = useGeoRestriction();
  const queryClient = useQueryClient();
  const { branches, selectedBranchId, setSelectedBranchId, fetchBranches, hasFetched } = useBranchStore();
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);

  const handleBranchSelect = (branchId: string | null) => {
    setSelectedBranchId(branchId);
    setBranchPickerOpen(false);
    void queryClient.invalidateQueries();
  };

  const isOwner = user?.role === "owner";

  useEffect(() => {
    if (isOwner && !hasFetched) {
      void fetchBranches();
    }
  }, [isOwner, hasFetched, fetchBranches]);

  // Warm staff list cache so /users opens instantly from any nav entry point.
  useEffect(() => {
    if (user?.role !== "owner" && user?.role !== "admin") return;
    prefetchStaffList(queryClient);
  }, [user?.role, queryClient]);

  const roleDashboardHref = user
    ? (ROLE_DASHBOARD_HREF[user.role] ?? getRoleDashboardPath(user.role))
    : "/dashboard";

  const navItems = ALL_NAV_ITEMS.filter((item) =>
    user && item.roles.includes(user.role),
  ).map((item) => ({
    ...item,
    name: t(item.nameKey),
    href: item.href === "__role_dashboard__" ? roleDashboardHref : item.href,
  }));

  const isHomePage = location === roleDashboardHref;

  const bottomItems = navItems.slice(0, MAX_BOTTOM_TABS);

  // A page is geo-blocked if outside zone and route is restricted
  const pageBlocked = isRestricted && hasBranches && isGeoRestrictedPath(location);

  const { clinic } = useAuthStore();
  const showBranchSelector = isOwner && branches.length > 0 && isHomePage;
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  const mainClinicName = clinic?.name ?? "Основная клиника";

  return (
    <div className="flex flex-col h-[100dvh] bg-[var(--bg)] overflow-hidden font-manrope">
      <AppointmentReminderModal />
      <AttendanceCheckModal />

      {/* Home page header */}
      {isHomePage && (
        <header className="flex-none bg-[var(--ds-surface)] border-b border-[var(--ds-border)] z-20 safe-area-top border-t-[1px]">
          {/* Branch selector — owner only, only when branches exist */}
          {showBranchSelector && (
            <div className="px-4 pt-2.5 pb-1.5">
              <div className="relative">
                <button
                  onClick={() => setBranchPickerOpen(!branchPickerOpen)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--ds-border)] bg-[var(--bg)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  <Building2 className="w-4 h-4 text-[var(--ds-primary)] shrink-0" />
                  <span className="flex-1 text-left text-[13px] font-medium text-[var(--text)] truncate">
                    {selectedBranch ? selectedBranch.name : mainClinicName}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 text-[var(--text-subtle)] transition-transform", branchPickerOpen && "rotate-180")} />
                </button>

                {branchPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setBranchPickerOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-xl shadow-lg z-20 overflow-hidden max-h-[240px] overflow-y-auto">
                      <button
                        onClick={() => handleBranchSelect(null)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors",
                          !selectedBranchId ? "bg-[var(--primary-light)] text-[var(--ds-primary)] font-semibold" : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                        )}
                      >
                        <Building2 className="w-4 h-4 shrink-0" />
                        <span className="flex-1 text-left">{mainClinicName}</span>
                        {!selectedBranchId && <Check className="w-4 h-4 text-[var(--ds-primary)] shrink-0" />}
                      </button>
                      {branches.map((branch) => (
                        <button
                          key={branch.id}
                          onClick={() => handleBranchSelect(branch.id)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors",
                            selectedBranchId === branch.id ? "bg-[var(--primary-light)] text-[var(--ds-primary)] font-semibold" : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                          )}
                        >
                          <MapPin className="w-4 h-4 shrink-0" />
                          <span className="flex-1 text-left truncate">{branch.name}</span>
                          {selectedBranchId === branch.id && <Check className="w-4 h-4 text-[var(--ds-primary)] shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 px-4 py-2.5">
            <GlobalSearch />
            {(user?.role === "doctor" ||
              user?.role === "owner" ||
              user?.role === "admin" ||
              user?.role === "assistant" ||
              user?.role === "nurse") && (
              <TabletScannerSlot />
            )}
            <div className="shrink-0">
              <NotificationBell />
            </div>
          </div>
        </header>
      )}

      {/* Geo restriction banner — shown when outside zone */}
      {isRestricted && hasBranches && (
        <div className="flex-none flex items-center gap-2 px-4 py-2 bg-[var(--warning-light)] border-b border-[var(--ds-border)] z-10">
          <MapPin className="w-4 h-4 text-[var(--warning)] shrink-0" />
          <p className="text-xs text-[var(--warning)] font-medium">
            Вы вне клиники — часть функций недоступна
          </p>
        </div>
      )}

      {/* Status indicator when geo is loading or denied (only if branches exist) */}
      {hasBranches && status === "denied" && (
        <div className="flex-none flex items-center gap-2 px-4 py-2 bg-[var(--bg)] border-b border-[var(--ds-border)] z-10">
          <AlertTriangle className="w-4 h-4 text-[var(--text-subtle)] shrink-0" />
          <p className="text-xs text-[var(--text-secondary)]">
            Геолокация недоступна — разрешите доступ в настройках браузера
          </p>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative">
        {pageBlocked ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--warning-light)] flex items-center justify-center">
              <MapPin className="w-8 h-8 text-[var(--warning)]" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-[var(--text)] mb-1">Вы вне клиники</h2>
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                Этот раздел доступен только когда вы находитесь в клинике.
                {activeBranch && ` Ближайший филиал: ${activeBranch.name}`}
              </p>
            </div>
          </div>
        ) : (
          children
        )}
      </main>

      {/* Bottom navigation */}
      <nav className="flex-none h-16 bg-[var(--ds-surface)] border-t border-[var(--ds-border)] flex items-stretch z-20 safe-area-bottom">
        {bottomItems.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          const blocked = isRestricted && hasBranches && item.geoRestricted;
          if (blocked) {
            return (
              <div
                key={item.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium select-none relative opacity-35"
              >
                <item.icon className="w-5 h-5 text-[var(--text-subtle)]" strokeWidth={1.8} />
                <span className="text-[var(--text-subtle)]">{item.name}</span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors select-none relative",
                isActive ? "text-[var(--ds-primary)]" : "text-[var(--text-secondary)]",
              )}
            >
              <item.icon
                className={cn("w-5 h-5", isActive ? "text-[var(--ds-primary)]" : "text-[var(--text-secondary)]")}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span>{item.name}</span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-[var(--ds-primary)]" />
              )}
            </Link>
          );
        })}
        {/* More / Menu tab */}
        <Link
          href="/menu"
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors select-none relative",
            location === "/menu" ? "text-[var(--ds-primary)]" : "text-[var(--text-secondary)]",
          )}
        >
          <MoreHorizontal
            className={cn("w-5 h-5", location === "/menu" ? "text-[var(--ds-primary)]" : "text-[var(--text-secondary)]")}
            strokeWidth={location === "/menu" ? 2.5 : 1.8}
          />
          <span>{t("nav.more")}</span>
          {location === "/menu" && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-[var(--ds-primary)]" />
          )}
        </Link>
      </nav>
    </div>
  );
}
