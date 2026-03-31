import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { NotificationBell } from "./notification-bell";
import {
  LayoutDashboard,
  KanbanSquare,
  MessageSquare,
  Users,
  Stethoscope,
  BarChart3,
  Settings,
  Activity,
  Calendar,
  Wallet,
  Package,
  MoreHorizontal,
  Bot,
  FileSpreadsheet,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const ROLE_DASHBOARD_HREF: Record<string, string> = {
  owner:      "/dashboard",
  admin:      "/dashboard/admin",
  doctor:     "/dashboard/doctor",
  accountant: "/dashboard/accountant",
  warehouse:  "/dashboard/warehouse",
};

const PAGE_HREF_TITLE_KEY: Record<string, string> = {
  "/dashboard":            "page.dashboard",
  "/dashboard/admin":      "page.adminDashboard",
  "/dashboard/doctor":     "page.doctorDashboard",
  "/dashboard/accountant": "page.accountantDashboard",
  "/dashboard/warehouse":  "page.warehouseDashboard",
  "/kanban":               "page.kanban",
  "/chat":                 "page.chat",
  "/patients":             "page.patients",
  "/procedures":           "page.procedures",
  "/schedule":             "page.schedule",
  "/analytics":            "page.analytics",
  "/doctor-analytics":     "page.doctorAnalytics",
  "/financials":           "page.financials",
  "/inventory":            "page.inventory",
  "/warehouse":            "page.warehouse",
  "/users":                "page.users",
  "/chatbot":              "page.chatbot",
  "/migration":            "page.migration",
  "/logs":                 "page.logs",
  "/menu":                 "page.menu",
};

const MAX_BOTTOM_TABS = 4;

const ALL_NAV_ITEMS = [
  { nameKey: "nav.dashboard",   href: "__role_dashboard__",  icon: LayoutDashboard, roles: ["owner","admin","doctor","accountant","warehouse"], menuOnly: false },
  { nameKey: "nav.kanban",      href: "/kanban",             icon: KanbanSquare,    roles: ["owner","admin"],                                    menuOnly: false },
  { nameKey: "nav.chat",        href: "/chat",               icon: MessageSquare,   roles: ["owner","admin","doctor"],                           menuOnly: false },
  { nameKey: "nav.patients",    href: "/patients",           icon: Users,           roles: ["owner","admin","doctor"],                           menuOnly: true  },
  { nameKey: "nav.procedures",  href: "/procedures",         icon: Stethoscope,     roles: ["owner","admin","doctor","accountant"],              menuOnly: false },
  { nameKey: "nav.schedule",    href: "/schedule",           icon: Calendar,        roles: ["admin"],                                            menuOnly: false },
  { nameKey: "nav.analytics",   href: "/analytics",          icon: BarChart3,       roles: ["owner"],                                            menuOnly: false },
  { nameKey: "nav.myAnalytics", href: "/doctor-analytics",   icon: BarChart3,       roles: ["doctor"],                                           menuOnly: false },
  { nameKey: "nav.financials",  href: "/financials",         icon: Wallet,          roles: ["owner","accountant"],                               menuOnly: false },
  { nameKey: "nav.inventory",   href: "/inventory",          icon: Package,         roles: ["owner","admin","warehouse"],                        menuOnly: false },
  { nameKey: "nav.users",       href: "/users",              icon: Settings,        roles: ["owner","admin"],                                    menuOnly: false },
  { nameKey: "nav.chatbot",     href: "/chatbot",            icon: Bot,             roles: ["owner","admin"],                                    menuOnly: false },
  { nameKey: "nav.migration",   href: "/migration",          icon: FileSpreadsheet, roles: ["owner","admin"],                                    menuOnly: false },
  { nameKey: "nav.logs",        href: "/logs",               icon: Activity,        roles: ["owner"],                                            menuOnly: false },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [location, setLocation] = useLocation();

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

  const bottomNavItems = navItems.filter((item) => !item.menuOnly);
  const bottomItems = bottomNavItems.slice(0, MAX_BOTTOM_TABS);
  const overflowItems = bottomNavItems.slice(MAX_BOTTOM_TABS);
  const isMenuActive = location === "/menu" || navItems.filter((item) => item.menuOnly).some(
    (item) => location === item.href || location.startsWith(`${item.href}/`),
  ) || overflowItems.some(
    (item) => location === item.href || location.startsWith(`${item.href}/`),
  );

  const pageTitle =
    PAGE_HREF_TITLE_KEY[location]
      ? t(PAGE_HREF_TITLE_KEY[location])
      : (Object.entries(PAGE_HREF_TITLE_KEY).find(([k]) => location.startsWith(k + "/"))?.[1]
          ? t(Object.entries(PAGE_HREF_TITLE_KEY).find(([k]) => location.startsWith(k + "/"))![1])
          : location.split("/")[1]?.replace(/-/g, " ") || t("page.dashboard"));

  return (
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      {/* Global header */}
      <header className="flex-none flex items-center justify-between px-5 py-2.5 bg-white border-b border-gray-100 z-20 safe-area-top">
        <button
          className="flex items-center gap-2 min-w-0"
          onClick={() => setLocation(roleDashboardHref)}
        >
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/30">
            <Stethoscope className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col leading-none min-w-0 text-left">
            <span className="font-bold text-sm text-gray-900 truncate">
              {clinic?.name || "Dental CRM"}
            </span>
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider truncate">
              {pageTitle}
            </span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        </button>

        <div className="flex items-center shrink-0">
          <NotificationBell />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">{children}</main>

      {/* Bottom navigation */}
      <nav className="flex-none h-16 bg-white border-t border-border/50 flex items-stretch z-20 safe-area-bottom">
        {bottomItems.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors select-none relative",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon
                className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span>{item.name}</span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}

        {/* Меню — always visible, navigates to /menu page */}
        <Link
          href="/menu"
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors select-none relative",
            isMenuActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          <MoreHorizontal
            className={cn("w-5 h-5", isMenuActive ? "text-primary" : "text-muted-foreground")}
            strokeWidth={1.8}
          />
          <span>Меню</span>
          {isMenuActive && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary" />
          )}
        </Link>
      </nav>
    </div>
  );
}
