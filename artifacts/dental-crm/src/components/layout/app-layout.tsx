import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useLogout } from "@workspace/api-client-react";
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
  LogOut,
  Activity,
  Calendar,
  Wallet,
  Package,
  MoreHorizontal,
  ChevronRight,
  Bot,
  FileSpreadsheet,
  ChevronDown,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";

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
};

const SUPPORTED_LANGS = ["ru", "kz", "en"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

const MAX_BOTTOM_TABS = 4;

export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, clinic, clearAuth } = useAuthStore();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState<Lang>((i18n.language as Lang) || "ru");

  const ALL_NAV_ITEMS = [
    { nameKey: "nav.dashboard", href: "__role_dashboard__", icon: LayoutDashboard, roles: ["owner", "admin", "doctor", "accountant", "warehouse"] },
    { nameKey: "nav.kanban",    href: "/kanban",     icon: KanbanSquare,  roles: ["owner", "admin"] },
    { nameKey: "nav.chat",      href: "/chat",       icon: MessageSquare, roles: ["owner", "admin", "doctor"] },
    { nameKey: "nav.patients",  href: "/patients",   icon: Users,         roles: ["owner", "admin", "doctor"] },
    { nameKey: "nav.procedures",href: "/procedures", icon: Stethoscope,   roles: ["owner", "admin", "doctor", "accountant"] },
    { nameKey: "nav.schedule",  href: "/schedule",   icon: Calendar,      roles: ["admin"] },
    { nameKey: "nav.analytics",       href: "/analytics",         icon: BarChart3, roles: ["owner"] },
    { nameKey: "nav.myAnalytics",    href: "/doctor-analytics",  icon: BarChart3, roles: ["doctor"] },
    { nameKey: "nav.financials",href: "/financials", icon: Wallet,        roles: ["owner", "accountant"] },
    { nameKey: "nav.inventory", href: "/inventory",  icon: Package,       roles: ["owner", "admin", "warehouse"] },
    { nameKey: "nav.users",     href: "/users",      icon: Settings,      roles: ["owner", "admin"] },
    { nameKey: "nav.chatbot",   href: "/chatbot",    icon: Bot,              roles: ["owner", "admin"] },
    { nameKey: "nav.migration", href: "/migration",  icon: FileSpreadsheet, roles: ["owner", "admin"] },
    { nameKey: "nav.logs",      href: "/logs",       icon: Activity,        roles: ["owner"] },
  ];

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        clearAuth();
        setLocation("/login");
      },
      onError: () => {
        toast({
          title: t("account.errorTitle"),
          description: t("account.errorDesc"),
          variant: "destructive",
        });
      },
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
    setProfileOpen(false);
  };

  const handleLangChange = (lang: Lang) => {
    void i18n.changeLanguage(lang);
    setCurrentLang(lang);
  };

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

  const bottomItems = navItems.slice(0, MAX_BOTTOM_TABS);
  const overflowItems = navItems.slice(MAX_BOTTOM_TABS);
  const hasMore = overflowItems.length > 0;

  const pageTitle =
    PAGE_HREF_TITLE_KEY[location]
      ? t(PAGE_HREF_TITLE_KEY[location])
      : (Object.entries(PAGE_HREF_TITLE_KEY).find(([k]) => location.startsWith(k + "/"))?.[1]
          ? t(Object.entries(PAGE_HREF_TITLE_KEY).find(([k]) => location.startsWith(k + "/"))![1])
          : location.split("/")[1]?.replace(/-/g, " ") || t("page.dashboard"));

  const isOverflowActive = overflowItems.some(
    (item) => location === item.href || location.startsWith(`${item.href}/`),
  );

  return (
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      {/* Global header — new design */}
      <header className="flex-none flex items-center justify-between px-5 py-2.5 bg-white border-b border-gray-100 z-20 safe-area-top">
        {/* Left: clinic + page title */}
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

        {/* Right: lang + bell + avatar */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {SUPPORTED_LANGS.map((lang) => (
              <button
                key={lang}
                onClick={() => handleLangChange(lang)}
                className={cn(
                  "text-[10px] font-bold px-2 py-1 rounded-md transition-colors",
                  currentLang === lang
                    ? "bg-white text-primary shadow-sm"
                    : "text-gray-400 hover:text-gray-700",
                )}
              >
                {t(`lang.${lang}`)}
              </button>
            ))}
          </div>

          <NotificationBell />

          <button
            onClick={() => setProfileOpen(true)}
            className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-sm shrink-0"
          >
            {user?.name.charAt(0).toUpperCase()}
          </button>
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
                isActive ? "text-primary" : "text-muted-foreground active:text-foreground",
              )}
            >
              <item.icon
                className={cn("w-5 h-5 transition-colors", isActive ? "text-primary" : "text-muted-foreground")}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span>{item.name}</span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}

        {hasMore && (
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors select-none",
              isOverflowActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <MoreHorizontal
              className={cn("w-5 h-5", isOverflowActive ? "text-primary" : "text-muted-foreground")}
              strokeWidth={1.8}
            />
            <span>{t("nav.more")}</span>
          </button>
        )}
      </nav>

      {/* Sheet: overflow menu */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader className="mb-2">
            <SheetTitle className="text-left text-base">{t("nav.more")}</SheetTitle>
          </SheetHeader>
          <div className="divide-y divide-border/50">
            {overflowItems.map((item) => {
              const isActive = location === item.href || location.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-4 py-3.5 px-1 transition-colors",
                    isActive ? "text-primary" : "text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      isActive ? "bg-primary/10" : "bg-muted",
                    )}
                  >
                    <item.icon
                      className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")}
                    />
                  </span>
                  <span className="flex-1 font-medium text-sm">{item.name}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* Sheet: profile */}
      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-left text-base">{t("account.title")}</SheetTitle>
          </SheetHeader>
          <div className="flex items-center gap-3 pb-4 border-b border-border/50 mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-lg flex-none">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{user?.name}</p>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              <span className="inline-block mt-0.5 text-[10px] font-bold text-primary uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded-full">
                {user?.role ? t(`role.${user.role}`) : user?.role}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="w-full flex items-center gap-3 py-3 text-destructive font-semibold text-sm"
          >
            <span className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-none">
              <LogOut className="w-5 h-5 text-destructive" />
            </span>
            {logoutMutation.isPending ? t("account.signingOut") : t("account.signOut")}
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
