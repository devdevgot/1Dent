import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { NotificationBell } from "./notification-bell";
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  BarChart3,
  Settings,
  Calendar,
  Wallet,
  Package,
  Bot,
  ChevronLeft,
  ChevronRight,
  LogOut,
  UserCircle,
  PlusCircle,
  Menu,
  X,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { clearAuthToken } from "@/lib/auth-token";

const ADMIN_NAV_ITEMS = [
  { nameKey: "nav.dashboard",            href: "/dashboard/admin",         icon: LayoutDashboard, badge: null },
  { nameKey: "adminNav.calendar",        href: "/admin/calendar",          icon: Calendar,        badge: null },
  { nameKey: "adminNav.newAppointment",  href: "/admin/appointments/new",  icon: PlusCircle,      badge: null },
  { nameKey: "adminNav.finance",         href: "/admin/finance",           icon: Wallet,          badge: null },
  { nameKey: "nav.patients",             href: "/patients",                icon: Users,           badge: null },
  { nameKey: "nav.services",             href: "/services",                icon: Stethoscope,     badge: null },
  { nameKey: "nav.chat",                 href: "/chat",                    icon: FaWhatsapp,      badge: null },
  { nameKey: "nav.inventory",            href: "/inventory",               icon: Package,         badge: null },
  { nameKey: "nav.chatbot",              href: "/chatbot",                 icon: Bot,             badge: null },
  { nameKey: "nav.settings",             href: "/settings",                icon: Settings,        badge: null },
];

interface AdminLayoutProps {
  children: ReactNode;
}

function useBreakpoint() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const handle = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);
  return width;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { t } = useTranslation();
  const { user, clearAuth } = useAuthStore();
  const [location] = useLocation();
  const [manualCollapsed, setManualCollapsed] = useState<boolean | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const width = useBreakpoint();

  const isTablet = width >= 768 && width < 1024;
  const isMobile = width < 768;

  const collapsed = manualCollapsed !== null ? manualCollapsed : isTablet;

  const navItems = ADMIN_NAV_ITEMS.map((item) => ({
    ...item,
    name: t(item.nameKey),
  }));

  function handleLogout() {
    clearAuthToken();
    clearAuth();
  }

  const initials = user?.name
    ? user.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : "A";

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={cn("flex flex-col h-full", mobile ? "w-72" : "w-full")}>
      {/* Logo area */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-5 border-b border-white/10 shrink-0",
        collapsed && !mobile ? "justify-center px-2" : "",
      )}>
        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
          <Stethoscope className="w-5 h-5 text-white" />
        </div>
        {(!collapsed || mobile) && (
          <div className="min-w-0">
            <p className="font-bold text-white text-sm leading-tight truncate">DentalCRM</p>
            <p className="text-white/50 text-xs truncate">{t("adminNav.adminPanel")}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl transition-all group relative",
                collapsed && !mobile ? "justify-center p-2.5" : "px-3 py-2.5",
                isActive
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              <item.icon
                className={cn(
                  "w-5 h-5 shrink-0",
                  isActive ? "text-white" : "text-white/70 group-hover:text-white",
                )}
              />
              {(!collapsed || mobile) && (
                <span className="text-sm font-medium truncate">{item.name}</span>
              )}
              {isActive && !collapsed && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-white/80" />
              )}
              {collapsed && !mobile && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: user + logout */}
      <div className="shrink-0 border-t border-white/10 p-3 space-y-1">
        <Link
          href="/account-settings"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-xl transition-colors hover:bg-white/10 group",
            collapsed && !mobile ? "justify-center p-2" : "px-3 py-2",
          )}
        >
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-white text-xs font-bold">
            {initials}
          </div>
          {(!collapsed || mobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-white/50 truncate">{t("roles.admin")}</p>
            </div>
          )}
          {(!collapsed || mobile) && (
            <UserCircle className="w-4 h-4 text-white/40 group-hover:text-white/70 shrink-0" />
          )}
        </Link>

        <div className="flex gap-1">
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center gap-2 rounded-xl text-white/60 hover:bg-white/10 hover:text-white transition-colors",
              collapsed && !mobile ? "flex-1 justify-center p-2" : "flex-1 px-3 py-2",
            )}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {(!collapsed || mobile) && <span className="text-xs font-medium">{t("account.signOut")}</span>}
          </button>

          {!mobile && (
            <button
              onClick={() => setManualCollapsed((c) => (c === null ? !isTablet : !c))}
              className="p-2 rounded-xl text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              title={collapsed ? t("adminNav.expand") : t("adminNav.collapse")}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] bg-slate-100 overflow-hidden">
      {/* Desktop/Tablet sidebar — shown at ≥768px */}
      {!isMobile && (
        <aside
          className={cn(
            "flex flex-col bg-[#1a2204] transition-all duration-200 ease-in-out shrink-0 z-30",
            collapsed ? "w-16" : "w-60",
          )}
        >
          <SidebarContent />
        </aside>
      )}

      {/* Mobile sidebar overlay — shown only <768px */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 bg-[#1a2204] flex flex-col">
            <SidebarContent mobile />
          </aside>
          <button
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex-none h-14 bg-white border-b border-gray-100 flex items-center gap-3 px-4 z-10">
          {/* Mobile burger — only <768px */}
          {isMobile && (
            <button
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Breadcrumb / page title */}
          <div className="flex-1 min-w-0">
            {(() => {
              const current = navItems.find(
                (item) => location === item.href || location.startsWith(`${item.href}/`),
              );
              return (
                <p className="text-sm font-semibold text-gray-700 truncate">
                  {current?.name ?? "DentalCRM"}
                </p>
              );
            })()}
          </div>

          {/* Notifications */}
          <div className="shrink-0">
            <NotificationBell />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
