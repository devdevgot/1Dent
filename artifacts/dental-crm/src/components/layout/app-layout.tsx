import { ReactNode, Suspense, lazy, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { useBranchStore } from "@/hooks/use-branch-store";
import {
  MapPin,
  AlertTriangle,
  Building2,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { prefetchStaffList } from "@workspace/api-client-react";
import { BottomTabBar } from "./bottom-tab-bar";
import { OverlayNavigationProvider } from "@/hooks/use-overlay-navigation";
import { MenuServiceOverlay } from "./menu-service-overlay";
import { isGeoRestrictedPath } from "@/lib/geo-restriction";

const GlobalSearch = lazy(() =>
  import("./global-search").then((m) => ({ default: m.GlobalSearch })),
);
const NotificationBell = lazy(() =>
  import("./notification-bell").then((m) => ({ default: m.NotificationBell })),
);
const AppointmentReminderModal = lazy(() =>
  import("./appointment-reminder-modal").then((m) => ({ default: m.AppointmentReminderModal })),
);
const AttendanceCheckModal = lazy(() =>
  import("./attendance-check-modal").then((m) => ({ default: m.AttendanceCheckModal })),
);
const TabletScannerSlot = lazy(() =>
  import("@/components/tablet/tablet-scanner-slot").then((m) => ({ default: m.TabletScannerSlot })),
);

const ROLE_DASHBOARD_HREF: Record<string, string> = {
  owner:      "/dashboard",
  admin:      "/dashboard/admin",
  doctor:     "/dashboard/doctor",
  accountant: "/dashboard/accountant",
  warehouse:  "/dashboard/warehouse",
};

// Routes that are off-limits outside geo-zone (for non-owners)

function useAfterFirstPaint() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const scheduleIdle = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => {
      const id = window.setTimeout(
        () => cb({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline),
        1,
      );
      return id as unknown as number;
    });
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    const id = scheduleIdle(() => setReady(true), { timeout: 1_500 });
    return () => cancelIdle(id);
  }, []);

  return ready;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();
  const [location] = useLocation();
  const { status, activeBranch, isRestricted, hasBranches } = useGeoRestriction();
  const queryClient = useQueryClient();
  const { branches, selectedBranchId, setSelectedBranchId, fetchBranches, hasFetched } = useBranchStore();
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const afterFirstPaint = useAfterFirstPaint();

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

  const isHomePage = location === roleDashboardHref;

  // A page is geo-blocked if outside zone and route is restricted
  const pageBlocked = isRestricted && hasBranches && isGeoRestrictedPath(location);

  const { clinic } = useAuthStore();
  const showBranchSelector = isOwner && branches.length > 0 && isHomePage;
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  const mainClinicName = clinic?.name ?? "Основная клиника";

  return (
    <OverlayNavigationProvider>
      <div className="flex flex-col h-[100dvh] bg-[#faf8f4] overflow-hidden font-manrope">
      {afterFirstPaint && (
        <Suspense fallback={null}>
          <AppointmentReminderModal />
          <AttendanceCheckModal />
        </Suspense>
      )}

      {/* Home page header */}
      {isHomePage && (
        <header className="flex-none bg-white border-b border-[#e8e3d9] z-20 safe-area-top border-t-[1px]">
          {/* Branch selector — owner only, only when branches exist */}
          {showBranchSelector && (
            <div className="px-4 pt-2.5 pb-1.5">
              <div className="relative">
                <button
                  onClick={() => setBranchPickerOpen(!branchPickerOpen)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[#e8e3d9] bg-[#faf8f4] hover:bg-[#f1ede4] transition-colors"
                >
                  <Building2 className="w-4 h-4 text-[#1f75fe] shrink-0" />
                  <span className="flex-1 text-left text-xs font-medium text-[#0f172a] truncate">
                    {selectedBranch ? selectedBranch.name : mainClinicName}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 text-[#94a3b8] transition-transform", branchPickerOpen && "rotate-180")} />
                </button>

                {branchPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setBranchPickerOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e8e3d9] rounded-xl shadow-lg z-20 overflow-hidden max-h-[240px] overflow-y-auto">
                      <button
                        onClick={() => handleBranchSelect(null)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors",
                          !selectedBranchId ? "bg-[var(--primary-light)] text-[#1f75fe] font-semibold" : "text-[#64748b] hover:bg-[#f1ede4] hover:text-[#0f172a]",
                        )}
                      >
                        <Building2 className="w-4 h-4 shrink-0" />
                        <span className="flex-1 text-left">{mainClinicName}</span>
                        {!selectedBranchId && <Check className="w-4 h-4 text-[#1f75fe] shrink-0" />}
                      </button>
                      {branches.map((branch) => (
                        <button
                          key={branch.id}
                          onClick={() => handleBranchSelect(branch.id)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors",
                            selectedBranchId === branch.id ? "bg-[var(--primary-light)] text-[#1f75fe] font-semibold" : "text-[#64748b] hover:bg-[#f1ede4] hover:text-[#0f172a]",
                          )}
                        >
                          <MapPin className="w-4 h-4 shrink-0" />
                          <span className="flex-1 text-left truncate">{branch.name}</span>
                          {selectedBranchId === branch.id && <Check className="w-4 h-4 text-[#1f75fe] shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 px-4 py-2.5">
            <Suspense fallback={<div className="h-10 flex-1" />}>
              <GlobalSearch />
            </Suspense>
            {(user?.role === "doctor" ||
              user?.role === "owner" ||
              user?.role === "admin" ||
              user?.role === "assistant" ||
              user?.role === "nurse") && (
              <Suspense fallback={<div className="h-10 w-10 shrink-0" />}>
                <TabletScannerSlot />
              </Suspense>
            )}
            <div className="shrink-0">
              <Suspense fallback={<div className="h-10 w-10" />}>
                <NotificationBell />
              </Suspense>
            </div>
          </div>
        </header>
      )}

      {/* Geo restriction banner — shown when outside zone */}
      {isRestricted && hasBranches && (
        <div className="flex-none flex items-center gap-2 px-4 py-2 bg-[var(--warning-light)] border-b border-[#e8e3d9] z-10">
          <MapPin className="w-4 h-4 text-[#d97706] shrink-0" />
          <p className="text-xs text-[#d97706] font-medium">
            Вы вне клиники — часть функций недоступна
          </p>
        </div>
      )}

      {/* Status indicator when geo is loading or denied (only if branches exist) */}
      {hasBranches && status === "denied" && (
        <div className="flex-none flex items-center gap-2 px-4 py-2 bg-[#faf8f4] border-b border-[#e8e3d9] z-10">
          <AlertTriangle className="w-4 h-4 text-[#94a3b8] shrink-0" />
          <p className="text-xs text-[#64748b]">
            Геолокация недоступна — разрешите доступ в настройках браузера
          </p>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative">
        {pageBlocked ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--warning-light)] flex items-center justify-center">
              <MapPin className="w-8 h-8 text-[#d97706]" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-[#0f172a] mb-1">Вы вне клиники</h2>
              <p className="text-xs text-[#64748b] leading-relaxed">
                Этот раздел доступен только когда вы находитесь в клинике.
                {activeBranch && ` Ближайший филиал: ${activeBranch.name}`}
              </p>
            </div>
          </div>
        ) : (
          children
        )}
      </main>

      {user && (
        <BottomTabBar
          roleDashboardHref={roleDashboardHref}
          role={user.role}
          isRestricted={isRestricted}
          hasBranches={hasBranches}
        />
      )}

      <MenuServiceOverlay />
    </div>
    </OverlayNavigationProvider>
  );
}
