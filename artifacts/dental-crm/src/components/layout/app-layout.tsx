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
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const ROLE_DASHBOARD_HREF: Record<string, string> = {
  owner: "/dashboard",
  admin: "/dashboard",
  doctor: "/dashboard/doctor",
  accountant: "/dashboard/accountant",
  warehouse: "/dashboard/warehouse",
};

const ALL_NAV_ITEMS = [
  { name: "Dashboard", href: "__role_dashboard__", icon: LayoutDashboard, roles: ["owner", "admin", "doctor", "accountant", "warehouse"] },
  { name: "Kanban", href: "/kanban", icon: KanbanSquare, roles: ["owner", "admin"] },
  { name: "Chat", href: "/chat", icon: MessageSquare, roles: ["owner", "admin", "doctor"] },
  { name: "Patients", href: "/patients", icon: Users, roles: ["owner", "admin", "doctor"] },
  { name: "Procedures", href: "/procedures", icon: Stethoscope, roles: ["owner", "admin", "doctor", "accountant"] },
  { name: "Schedule", href: "/schedule", icon: Calendar, roles: ["admin"] },
  { name: "Analytics", href: "/analytics", icon: BarChart3, roles: ["owner"] },
  { name: "Financials", href: "/financials", icon: Wallet, roles: ["accountant"] },
  { name: "Inventory", href: "/inventory", icon: Package, roles: ["owner", "admin", "warehouse"] },
  { name: "Users", href: "/users", icon: Settings, roles: ["owner"] },
  { name: "Activity Log", href: "/logs", icon: Activity, roles: ["owner"] },
];

const MAX_BOTTOM_TABS = 4;

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/doctor": "My Dashboard",
  "/dashboard/accountant": "Financials",
  "/dashboard/warehouse": "Warehouse",
  "/kanban": "Patients",
  "/chat": "Chat",
  "/patients": "Patients",
  "/procedures": "Procedures",
  "/schedule": "Schedule",
  "/analytics": "Analytics",
  "/financials": "Financials",
  "/inventory": "Inventory",
  "/users": "Users",
  "/logs": "Activity Log",
};

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, clinic, clearAuth } = useAuthStore();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        clearAuth();
        setLocation("/login");
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to log out. Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
    setProfileOpen(false);
  };

  const roleDashboardHref = user
    ? (ROLE_DASHBOARD_HREF[user.role] ?? getRoleDashboardPath(user.role))
    : "/dashboard";

  const navItems = ALL_NAV_ITEMS.filter((item) =>
    user && item.roles.includes(user.role)
  ).map((item) => ({
    ...item,
    href: item.href === "__role_dashboard__" ? roleDashboardHref : item.href,
  }));

  const bottomItems = navItems.slice(0, MAX_BOTTOM_TABS);
  const overflowItems = navItems.slice(MAX_BOTTOM_TABS);
  const hasMore = overflowItems.length > 0;

  const pageTitle =
    PAGE_TITLES[location] ||
    Object.entries(PAGE_TITLES).find(([k]) => location.startsWith(k + "/"))?.[1] ||
    location.split("/")[1]?.replace(/-/g, " ") ||
    "Dashboard";

  const isOverflowActive = overflowItems.some(
    (item) => location === item.href || location.startsWith(`${item.href}/`),
  );

  return (
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      {/* ── Top Header ── */}
      <header className="flex-none flex items-center h-14 px-4 bg-white border-b border-border/50 z-20 safe-area-top">
        {/* Clinic Logo + Title */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="Logo"
            className="w-8 h-8 object-contain flex-none"
          />
          <div className="flex flex-col leading-none min-w-0">
            <span className="font-display font-bold text-sm text-foreground truncate">
              {clinic?.name || "Dental CRM"}
            </span>
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
              {pageTitle}
            </span>
          </div>
        </div>

        {/* Right side: Notifications + Avatar */}
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            onClick={() => setProfileOpen(true)}
            className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-sm flex-none"
          >
            {user?.name.charAt(0).toUpperCase()}
          </button>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {children}
      </main>

      {/* ── Bottom Navigation Bar ── */}
      <nav className="flex-none h-16 bg-white border-t border-border/50 flex items-stretch z-20 safe-area-bottom">
        {bottomItems.map((item) => {
          const isActive =
            location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors select-none",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:text-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "w-5 h-5 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span>{item.name}</span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}

        {/* More button */}
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
            <span>More</span>
          </button>
        )}
      </nav>

      {/* ── More Sheet (overflow nav) ── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader className="mb-2">
            <SheetTitle className="text-left text-base">More</SheetTitle>
          </SheetHeader>
          <div className="divide-y divide-border/50">
            {overflowItems.map((item) => {
              const isActive =
                location === item.href || location.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.name}
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
                      className={cn(
                        "w-5 h-5",
                        isActive ? "text-primary" : "text-muted-foreground",
                      )}
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

      {/* ── Profile Sheet ── */}
      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-left text-base">Account</SheetTitle>
          </SheetHeader>
          <div className="flex items-center gap-3 pb-4 border-b border-border/50 mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-lg flex-none">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{user?.name}</p>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              <span className="inline-block mt-0.5 text-[10px] font-bold text-primary uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded-full">
                {user?.role}
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
            {logoutMutation.isPending ? "Signing out…" : "Sign out"}
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
