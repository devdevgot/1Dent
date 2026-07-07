import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { NotificationBell } from "./notification-bell";
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  BarChart3,
  Contact,
  Calendar,
  Wallet,
  ChevronLeft,
  ChevronRight,
  LogOut,
  UserCircle,
  Menu,
  X,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { clearAuthToken } from "@/lib/auth-token";
import { clearPersistedQueryCache } from "@/lib/query-persist";

const ADMIN_NAV_ITEMS = [
  { nameKey: "nav.dashboard",            href: "/dashboard/admin",         icon: LayoutDashboard, badge: null },
  { nameKey: "adminNav.calendar",        href: "/admin/calendar",          icon: Calendar,        badge: null },
  { nameKey: "adminNav.finance",         href: "/admin/finance",           icon: Wallet,          badge: null },
  { nameKey: "nav.patients",             href: "/patients",                icon: Users,           badge: null },
  { nameKey: "nav.services",             href: "/services",                icon: Stethoscope,     badge: null },
  { nameKey: "nav.chat",                 href: "/chat",                    icon: FaWhatsapp,      badge: null },
  { nameKey: "nav.users",                href: "/users",                   icon: Contact,        badge: null },
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const width = useBreakpoint();

  const isTablet = width >= 768 && width < 1024;
  const isMobile = width < 768;

  const collapsed = false;

  const navItems = ADMIN_NAV_ITEMS.map((item) => ({
    ...item,
    name: t(item.nameKey),
  }));

  function handleLogout() {
    clearPersistedQueryCache();
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
    <div className={cn("flex flex-col h-full font-manrope", mobile ? "w-72" : "w-full")}>
      {/* Logo area */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-5 border-b border-[#e8e3d9] shrink-0",
        collapsed && !mobile ? "justify-center px-2" : "",
      )}>
        <div className="w-9 h-9 rounded-xl bg-[#1f75fe]/10 flex items-center justify-center shrink-0">
          <Stethoscope className="w-5 h-5 text-[#1f75fe]" />
        </div>
        {(!collapsed || mobile) && (
          <div className="min-w-0">
            <p className="font-bold text-[#0f172a] text-sm leading-tight truncate">1Dent</p>
            <p className="text-[#64748b] text-xs truncate">{t("adminNav.adminPanel")}</p>
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
                "flex items-center gap-3 rounded-xl transition-colors group relative",
                collapsed && !mobile ? "justify-center p-2.5" : "px-3 py-2.5",
                isActive
                  ? "bg-[#1f75fe]/10 text-[#1f75fe] font-semibold"
                  : "text-[#64748b] font-medium hover:bg-[#f1ede4] hover:text-[#0f172a]",
              )}
            >
              <item.icon
                className={cn(
                  "w-5 h-5 shrink-0",
                  isActive ? "text-[#1f75fe]" : "text-[#64748b] group-hover:text-[#0f172a]",
                )}
              />
              {(!collapsed || mobile) && (
                <span className="text-sm truncate">{item.name}</span>
              )}
              {collapsed && !mobile && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-[#0f172a] text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: user + logout */}
      <div className="shrink-0 border-t border-[#e8e3d9] p-3 space-y-1">
        <Link
          href="/account-settings"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-xl transition-colors hover:bg-[#f1ede4] group",
            collapsed && !mobile ? "justify-center p-2" : "px-3 py-2",
          )}
        >
          <div className="w-8 h-8 rounded-full bg-[#1f75fe]/10 flex items-center justify-center shrink-0 text-[#1f75fe] text-xs font-bold">
            {initials}
          </div>
          {(!collapsed || mobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#0f172a] truncate">{user?.name}</p>
              <p className="text-xs text-[#64748b] truncate">{t("roles.admin")}</p>
            </div>
          )}
          {(!collapsed || mobile) && (
            <UserCircle className="w-4 h-4 text-[#94a3b8] group-hover:text-[#64748b] shrink-0" />
          )}
        </Link>

        <div className="flex gap-1">
          <button
            onClick={handleLogout}
            className="flex-1 px-3 py-2 flex items-center gap-2 rounded-xl text-[#64748b] hover:bg-[#f1ede4] hover:text-[#0f172a] transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium">{t("account.signOut")}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] bg-[#faf8f4] overflow-hidden font-manrope">
      {/* Desktop/Tablet sidebar — shown at ≥768px */}
      {!isMobile && (
        <aside
          className={cn(
            "flex flex-col bg-[#faf8f4] border-r border-[#e8e3d9] transition-all duration-200 ease-in-out shrink-0 z-30",
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
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 bg-[#faf8f4] border-r border-[#e8e3d9] flex flex-col">
            <SidebarContent mobile />
          </aside>
          <button
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white border border-[#e8e3d9] text-[#64748b] flex items-center justify-center hover:bg-[#f1ede4] transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar — minimal chrome; pages own their PageHeader */}
        <header className="flex-none h-12 bg-[var(--ds-surface)] border-b border-[var(--ds-border)] flex items-center gap-3 px-4 z-10">
          {isMobile ? (
            <button
              type="button"
              className="w-9 h-9 flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-9 shrink-0" />
          )}

          <div className="flex-1 min-w-0" />

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
