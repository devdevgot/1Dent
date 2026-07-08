
import { useEffect, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient, persistOptions, clearPersistedQueryCache } from "@/lib/query-persist";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { useGetMe, getGetMeQueryKey, setUnauthorizedHandler, setBaseUrl } from "@workspace/api-client-react";
import { clearAuthToken, restoreAuthToken } from "@/lib/auth-token";
import { restoreBranchContext, clearBranchContext } from "@/lib/branch-context";
import type { User, Clinic } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { ErrorBoundary } from "@/components/error-boundary";
import { installGlobalErrorHandlers } from "@/lib/report-error";

function LazyPageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-[#1f75fe]/20 border-t-[#1f75fe] rounded-full animate-spin" />
    </div>
  );
}

function StaffRouteFallback() {
  return (
    <div className="min-h-screen bg-[#faf8f4] font-manrope">
      <div className="px-5 pt-5 pb-4 bg-white border-b border-[#e8e3d9]">
        <div className="h-7 w-40 rounded-xl bg-[#f1ede4] animate-pulse" />
        <div className="h-4 w-32 rounded-lg bg-[#f1ede4] animate-pulse mt-2" />
      </div>
      <div className="p-5">
        <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="px-4 py-3.5 flex items-center gap-3 border-b border-[#e8e3d9] last:border-b-0">
              <div className="w-9 h-9 rounded-xl bg-[#f1ede4] animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 max-w-full rounded bg-[#f1ede4] animate-pulse" />
                <div className="h-3 w-24 rounded bg-[#f1ede4] animate-pulse" />
              </div>
              <div className="h-6 w-16 rounded-lg bg-[#f1ede4] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type LazyPageModule = { default: React.ComponentType<any> };

function lazyPage(
  load: () => Promise<LazyPageModule>,
  fallback: React.ReactNode = <LazyPageFallback />,
) {
  const Component = lazy(load);
  return function LazyRoutePage() {
    return (
      <Suspense fallback={fallback}>
        <Component />
      </Suspense>
    );
  };
}

const Login = lazyPage(() => import("@/pages/login"));
const Register = lazyPage(() => import("@/pages/register"));
const ForgotPassword = lazyPage(() => import("@/pages/forgot-password"));
const ResetPassword = lazyPage(() => import("@/pages/reset-password"));
const OwnerDashboard = lazyPage(() => import("@/pages/dashboard-owner"));
const AdminDashboard = lazyPage(() => import("@/pages/dashboard-admin"));
const DoctorDashboard = lazyPage(() => import("@/pages/dashboard-doctor"));
const AccountantDashboard = lazyPage(() => import("@/pages/dashboard-accountant"));
const WarehouseDashboard = lazyPage(() => import("@/pages/dashboard-warehouse"));
const PatientsPage = lazyPage(() => import("@/pages/patients"));
const ToothDetailPage = lazyPage(() => import("@/pages/tooth-detail"));
const ChatPage = lazyPage(() => import("@/pages/chat"));
const AnalyticsPage = lazyPage(() => import("@/pages/analytics"));
const InventoryPage = lazyPage(() => import("@/pages/inventory"));
const ServicesPage = lazyPage(() => import("@/pages/services"));
const LogsPage = lazyPage(() => import("@/pages/logs"));
const FinancialsPage = lazyPage(() => import("@/pages/financials"));
const WarehousePage = lazyPage(() => import("@/pages/warehouse"));
const UsersPage = lazyPage(() => import("@/pages/users"), <StaffRouteFallback />);
const ChatbotPage = lazyPage(() => import("@/pages/chatbot"));
const StaffDetailPage = lazyPage(() => import("@/pages/staff-detail"), <StaffRouteFallback />);
const DoctorAnalyticsPage = lazyPage(() => import("@/pages/doctor-analytics"));
const DoctorSchedulePage = lazyPage(() => import("@/pages/doctor-schedule"));
const DoctorScheduleDayPage = lazyPage(() => import("@/pages/doctor-schedule-day"));
const AccountSettingsPage = lazyPage(() => import("@/pages/account-settings"));
const AccountEditProfilePage = lazyPage(() => import("@/pages/account-edit-profile"));
const AccountChangeEmailPage = lazyPage(() => import("@/pages/account-change-email"));
const AccountChangePasswordPage = lazyPage(() => import("@/pages/account-change-password"));
const MenuPage = lazyPage(() => import("@/pages/menu"));
const MigrationPage = lazyPage(() => import("@/pages/migration"));
const ChannelsPage = lazyPage(() => import("@/pages/channels"));
const ContractTemplatesPage = lazyPage(() => import("@/pages/contract-templates"));
const BranchesPage = lazyPage(() => import("@/pages/branches"));
const ClinicBranchesPage = lazyPage(() => import("@/pages/clinic-branches"));
const PricingPage = lazyPage(() => import("@/pages/pricing"));
const AiCreditsPage = lazyPage(() => import("@/pages/ai-credits"));
const LandingPage = lazyPage(() => import("@/pages/landing"));
const SlashTabletPage = lazyPage(() => import("@/pages/slash-tablet"));
const TabletLinkPage = lazyPage(() => import("@/pages/slash-tablet/tablet-link"));
const NotFound = lazyPage(() => import("@/pages/not-found"));
const AdminCalendarPage = lazyPage(() => import("@/pages/admin-calendar"));
const AdminAppointmentNewPage = lazyPage(() => import("@/pages/admin-appointment-new"));
const AdminFinancePage = lazyPage(() => import("@/pages/admin-finance"));
const PayrollMyPage = lazyPage(() => import("@/pages/payroll-my"));
const PlanPaywall = lazy(() =>
  import("@/components/billing/plan-paywall").then((m) => ({ default: m.PlanPaywall })),
);

// ---------------------------------------------------------------------------
// Dev auth bypass — set VITE_DEV_BYPASS_AUTH=true in .env.local to skip login
// ---------------------------------------------------------------------------
const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

const DEV_MOCK_USER: User = {
  id: "dev-bypass-user",
  clinicId: "dev-bypass-clinic",
  name: "Dev Owner",
  email: "dev@clinic.com",
  role: "owner",
  isActive: true,
  createdAt: new Date().toISOString(),
};

const DEV_MOCK_CLINIC: Clinic = {
  id: "dev-bypass-clinic",
  name: "Dev Clinic",
  createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
} as Clinic;

// API base URL: VITE_API_URL for split hosting; omit for same-origin (Render/Replit single service).
const apiBaseUrl = import.meta.env.VITE_API_URL as string | undefined;
if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl.replace(/\/+$/, ""));
}

// Restore auth token and branch context from localStorage on page load
restoreAuthToken();
restoreBranchContext();

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setAuth, clearAuth, setLoading } = useAuthStore();
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      refetchOnWindowFocus: false,
      enabled: !DEV_BYPASS,
    }
  });

  useEffect(() => {
    if (DEV_BYPASS) {
      setAuth(DEV_MOCK_USER, DEV_MOCK_CLINIC);
      return;
    }

    if (isLoading) {
      setLoading(true);
    } else if (data?.success && data.data) {
      setAuth(data.data.user, data.data.clinic);
    } else {
      clearAuth();
    }
  }, [data, isLoading, error, setAuth, clearAuth, setLoading]);

  useEffect(() => {
    if (DEV_BYPASS) return;

    setUnauthorizedHandler(() => {
      const path = window.location.pathname;
      if (path.startsWith("/tablet")) return;

      clearPersistedQueryCache();
      clearBranchContext();
      clearAuth();
      clearAuthToken();
      setLocation("/login");
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [clearAuth, setLocation]);

  if (!DEV_BYPASS && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}


function KanbanRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/patients?view=kanban", { replace: true }); }, [setLocation]);
  return null;
}

function ProceduresRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/patients", { replace: true }); }, [setLocation]);
  return null;
}

function Router() {
  const { isAuthenticated, user } = useAuthStore();
  const [location, setLocation] = useLocation();

  const roleDashboard = user ? getRoleDashboardPath(user.role) : "/dashboard";

  useEffect(() => {
    if (!DEV_BYPASS && isAuthenticated && (location === "/login" || location === "/register")) {
      setLocation(roleDashboard);
    }
  }, [isAuthenticated, location, setLocation, roleDashboard]);

  useEffect(() => {
    if (isAuthenticated && location === "/") {
      setLocation(roleDashboard);
    }
  }, [isAuthenticated, location, setLocation, roleDashboard]);

  return (
    <>
    {isAuthenticated && (
      <Suspense fallback={null}>
        <PlanPaywall />
      </Suspense>
    )}
    <Switch>
      <Route path="/" component={LandingPage} />
      {/* SlashTablet — планшетный режим для кабинета врача (QR / PIN вход) */}
      <Route path="/tablet/link" component={TabletLinkPage} />
      <Route path="/tablet" component={SlashTabletPage} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />

      {/* Owner dashboard */}
      <Route path="/dashboard">
        <ProtectedRoute component={OwnerDashboard} allowedRoles={['owner']} />
      </Route>

      {/* Admin dashboard */}
      <Route path="/dashboard/admin">
        <ProtectedRoute component={AdminDashboard} allowedRoles={['admin']} />
      </Route>

      {/* Doctor dashboard */}
      <Route path="/dashboard/doctor">
        <ProtectedRoute component={DoctorDashboard} allowedRoles={['doctor']} />
      </Route>

      {/* Accountant dashboard */}
      <Route path="/dashboard/accountant">
        <ProtectedRoute component={AccountantDashboard} allowedRoles={['accountant']} />
      </Route>

      {/* Warehouse dashboard */}
      <Route path="/dashboard/warehouse">
        <ProtectedRoute component={WarehouseDashboard} allowedRoles={['warehouse']} />
      </Route>

      {/* Kanban redirect → unified patients page */}
      <Route path="/kanban">
        <KanbanRedirect />
      </Route>

      {/* Admin-specific routes */}
      <Route path="/admin/calendar">
        <ProtectedRoute component={AdminCalendarPage} allowedRoles={['admin']} />
      </Route>

      {/* Shared calendar — owner sees all appointments in AppLayout */}
      <Route path="/calendar">
        <ProtectedRoute component={AdminCalendarPage} allowedRoles={['owner', 'admin']} />
      </Route>
      <Route path="/admin/appointments/new">
        <ProtectedRoute component={AdminAppointmentNewPage} allowedRoles={['admin']} />
      </Route>
      <Route path="/admin/finance">
        <ProtectedRoute component={AdminFinancePage} allowedRoles={['admin']} />
      </Route>

      {/* Feature Routes */}
      <Route path="/patients">
        <ProtectedRoute component={PatientsPage} allowedRoles={['owner', 'admin', 'doctor', 'accountant']} />
      </Route>
      <Route path="/patients/:patientId/teeth/:fdi">
        <ProtectedRoute component={ToothDetailPage} allowedRoles={['owner', 'admin', 'doctor']} />
      </Route>
      <Route path="/chat">
        <ProtectedRoute component={ChatPage} allowedRoles={['owner', 'admin', 'doctor']} />
      </Route>
      <Route path="/analytics">
        <ProtectedRoute component={AnalyticsPage} allowedRoles={['owner', 'admin', 'doctor', 'accountant', 'warehouse']} />
      </Route>
      <Route path="/inventory">
        <ProtectedRoute component={InventoryPage} allowedRoles={['owner', 'admin', 'warehouse', 'doctor', 'accountant']} />
      </Route>
      <Route path="/services">
        <ProtectedRoute component={ServicesPage} allowedRoles={['owner', 'admin', 'doctor', 'accountant']} />
      </Route>

      {/* Doctor schedule (read-only calendar) */}
      <Route path="/schedule">
        <ProtectedRoute component={DoctorSchedulePage} allowedRoles={['doctor']} />
      </Route>
      <Route path="/schedule/:date">
        <ProtectedRoute component={DoctorScheduleDayPage} allowedRoles={['doctor']} />
      </Route>
      <Route path="/payroll/my">
        <ProtectedRoute component={PayrollMyPage} allowedRoles={['doctor']} />
      </Route>
      <Route path="/logs">
        <ProtectedRoute component={LogsPage} allowedRoles={['owner']} />
      </Route>
      <Route path="/financials">
        <ProtectedRoute component={FinancialsPage} allowedRoles={['owner', 'accountant']} />
      </Route>
      <Route path="/procedures">
        <ProceduresRedirect />
      </Route>
      <Route path="/warehouse">
        <ProtectedRoute component={WarehousePage} allowedRoles={['owner', 'admin', 'warehouse']} />
      </Route>

      {/* Users management */}
      <Route path="/users">
        <ProtectedRoute component={UsersPage} allowedRoles={['owner', 'admin']} />
      </Route>

      {/* Chatbot management */}
      <Route path="/chatbot">
        <ProtectedRoute component={ChatbotPage} allowedRoles={['owner']} />
      </Route>


      <Route path="/users/:doctorId">
        <ProtectedRoute component={StaffDetailPage} allowedRoles={['owner', 'admin']} />
      </Route>

      {/* Doctor analytics */}
      <Route path="/doctor-analytics">
        <ProtectedRoute component={DoctorAnalyticsPage} allowedRoles={['owner', 'admin', 'doctor']} />
      </Route>

      {/* Menu page */}
      <Route path="/menu">
        <ProtectedRoute component={MenuPage} allowedRoles={['owner', 'admin', 'doctor', 'accountant', 'warehouse']} />
      </Route>

      {/* Channels page */}
      <Route path="/channels">
        <ProtectedRoute component={ChannelsPage} allowedRoles={['owner', 'admin']} />
      </Route>

      {/* Migration page */}
      <Route path="/migration">
        <ProtectedRoute component={MigrationPage} allowedRoles={['owner']} />
      </Route>


      {/* Contract templates management */}
      <Route path="/contract-templates">
        <ProtectedRoute component={ContractTemplatesPage} allowedRoles={['owner', 'admin', 'doctor']} />
      </Route>

      {/* Branches & geo-zones — owner only */}
      <Route path="/branches">
        <ProtectedRoute component={BranchesPage} allowedRoles={['owner']} />
      </Route>

      {/* Clinic branch management — owner only */}
      <Route path="/clinic-branches">
        <ProtectedRoute component={ClinicBranchesPage} allowedRoles={['owner']} />
      </Route>

      {/* Pricing / Tariffs — owner only */}
      <Route path="/pricing">
        <ProtectedRoute component={PricingPage} allowedRoles={['owner']} />
      </Route>

      <Route path="/ai-credits">
        <ProtectedRoute component={AiCreditsPage} allowedRoles={['owner', 'admin', 'doctor', 'accountant', 'warehouse']} />
      </Route>

      {/* Account settings pages */}
      <Route path="/account-settings">
        <ProtectedRoute component={AccountSettingsPage} allowedRoles={['owner', 'admin', 'doctor', 'accountant', 'warehouse']} />
      </Route>
      <Route path="/account/edit-profile">
        <ProtectedRoute component={AccountEditProfilePage} allowedRoles={['owner', 'admin', 'doctor', 'accountant', 'warehouse']} />
      </Route>
      <Route path="/account/change-email">
        <ProtectedRoute component={AccountChangeEmailPage} allowedRoles={['owner', 'admin', 'doctor', 'accountant', 'warehouse']} />
      </Route>
      <Route path="/account/change-password">
        <ProtectedRoute component={AccountChangePasswordPage} allowedRoles={['owner', 'admin', 'doctor', 'accountant', 'warehouse']} />
      </Route>

      {/* 404 */}
      <Route path="/:rest*" component={NotFound} />
    </Switch>
    </>
  );
}

function App() {
  useEffect(() => installGlobalErrorHandlers("dental-crm"), []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <TooltipProvider>
        <ErrorBoundary>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </WouterRouter>
        </ErrorBoundary>
        <Toaster />
        <SonnerToaster position="top-right" richColors />
      </TooltipProvider>
    </PersistQueryClientProvider>
  );
}

export default App;
