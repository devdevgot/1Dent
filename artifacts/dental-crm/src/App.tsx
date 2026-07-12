
import { useEffect, Suspense } from "react";
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
import { getRoleDashboardPath, CLINICAL_STAFF_ROLES } from "@/lib/role-redirect";
import { ErrorBoundary } from "@/components/error-boundary";
import { installGlobalErrorHandlers } from "@/lib/report-error";
import { clearChunkReloadFlag, lazyWithChunkRecovery } from "@/lib/chunk-reload";
import {
  PatientsPageSkeleton,
  ToothDetailPageSkeleton,
  AdminCalendarPageSkeleton,
  AppointmentNewPageSkeleton,
  DoctorSchedulePageSkeleton,
  DoctorScheduleDayPageSkeleton,
  DoctorAnalyticsPageSkeleton,
  AdminDashboardSkeleton,
  OwnerDashboardSkeleton,
  DoctorDashboardSkeleton,
  AccountantDashboardSkeleton,
  WarehouseDashboardSkeleton,
  FinancialsPageSkeleton,
  AdminFinancePageSkeleton,
  AnalyticsPageSkeleton,
  PayrollMyPageSkeleton,
  UsersPageSkeleton,
  StaffDetailPageSkeleton,
  InventoryPageSkeleton,
  WarehousePageSkeleton,
  ServicesPageSkeleton,
  LogsPageSkeleton,
  ChatPageSkeleton,
  ChatbotPageSkeleton,
  ChannelsPageSkeleton,
  MenuPageSkeleton,
  AiCreditsPageSkeleton,
  ContractTemplatesPageSkeleton,
  MigrationPageSkeleton,
  BranchesPageSkeleton,
  ClinicBranchesPageSkeleton,
  AppShellSkeleton,
  AccountSettingsPageSkeleton,
  AccountFormPageSkeleton,
  PricingPageSkeleton,
} from "@/components/skeletons";
import {
  AuthSessionSkeleton,
  LoginPageSkeleton,
  RegisterDisclaimerPageSkeleton,
} from "@/components/auth/auth-skeletons";

type LazyPageModule = { default: React.ComponentType<any> };

function lazyPage(
  load: () => Promise<LazyPageModule>,
  fallback: React.ReactNode = <AppShellSkeleton />,
) {
  const Component = lazyWithChunkRecovery(load);
  return function LazyRoutePage() {
    return (
      <Suspense fallback={fallback}>
        <Component />
      </Suspense>
    );
  };
}

const Login = lazyPage(() => import("@/pages/login"), <LoginPageSkeleton />);
const Register = lazyPage(() => import("@/pages/register"), <RegisterDisclaimerPageSkeleton />);
const ForgotPassword = lazyPage(() => import("@/pages/forgot-password"), <LoginPageSkeleton />);
const ResetPassword = lazyPage(() => import("@/pages/reset-password"), <LoginPageSkeleton />);
const OwnerDashboard = lazyPage(() => import("@/pages/dashboard-owner"), <OwnerDashboardSkeleton />);
const AdminDashboard = lazyPage(() => import("@/pages/dashboard-admin"), <AdminDashboardSkeleton />);
const DoctorDashboard = lazyPage(() => import("@/pages/dashboard-doctor"), <DoctorDashboardSkeleton />);
const AccountantDashboard = lazyPage(() => import("@/pages/dashboard-accountant"), <AccountantDashboardSkeleton />);
const WarehouseDashboard = lazyPage(() => import("@/pages/dashboard-warehouse"), <WarehouseDashboardSkeleton />);
const PatientsPage = lazyPage(() => import("@/pages/patients"), <PatientsPageSkeleton />);
const ToothDetailPage = lazyPage(() => import("@/pages/tooth-detail"), <ToothDetailPageSkeleton />);
const ChatPage = lazyPage(() => import("@/pages/chat"), <ChatPageSkeleton />);
const AnalyticsPage = lazyPage(() => import("@/pages/analytics"), <AnalyticsPageSkeleton />);
const InventoryPage = lazyPage(() => import("@/pages/inventory"), <InventoryPageSkeleton />);
const ServicesPage = lazyPage(() => import("@/pages/services"), <ServicesPageSkeleton />);
const LogsPage = lazyPage(() => import("@/pages/logs"), <LogsPageSkeleton />);
const FinancialsPage = lazyPage(() => import("@/pages/financials"), <FinancialsPageSkeleton />);
const WarehousePage = lazyPage(() => import("@/pages/warehouse"), <WarehousePageSkeleton />);
const UsersPage = lazyPage(() => import("@/pages/users"), <UsersPageSkeleton />);
const DoctorRatingsPage = lazyPage(() => import("@/pages/doctor-ratings"), <UsersPageSkeleton />);
const ChatbotPage = lazyPage(() => import("@/pages/chatbot"), <ChatbotPageSkeleton />);
const StaffDetailPage = lazyPage(() => import("@/pages/staff-detail"), <StaffDetailPageSkeleton />);
const DoctorAnalyticsPage = lazyPage(() => import("@/pages/doctor-analytics"), <DoctorAnalyticsPageSkeleton />);
const DoctorSchedulePage = lazyPage(() => import("@/pages/doctor-schedule"), <DoctorSchedulePageSkeleton />);
const DoctorScheduleDayPage = lazyPage(() => import("@/pages/doctor-schedule-day"), <DoctorScheduleDayPageSkeleton />);
const AccountSettingsPage = lazyPage(() => import("@/pages/account-settings"), <AccountSettingsPageSkeleton />);
const AccountEditProfilePage = lazyPage(() => import("@/pages/account-edit-profile"), <AccountFormPageSkeleton fields={1} />);
const AccountChangeEmailPage = lazyPage(() => import("@/pages/account-change-email"), <AccountFormPageSkeleton fields={2} />);
const AccountChangePasswordPage = lazyPage(() => import("@/pages/account-change-password"), <AccountFormPageSkeleton fields={3} />);
const MenuPage = lazyPage(() => import("@/pages/menu"), <MenuPageSkeleton />);
const MigrationPage = lazyPage(() => import("@/pages/migration"), <MigrationPageSkeleton />);
const ChannelsPage = lazyPage(() => import("@/pages/channels"), <ChannelsPageSkeleton />);
const ContractTemplatesPage = lazyPage(() => import("@/pages/contract-templates"), <ContractTemplatesPageSkeleton />);
const BranchesPage = lazyPage(() => import("@/pages/branches"), <BranchesPageSkeleton />);
const ClinicBranchesPage = lazyPage(() => import("@/pages/clinic-branches"), <ClinicBranchesPageSkeleton />);
const PricingPage = lazyPage(() => import("@/pages/pricing"), <PricingPageSkeleton />);
const AiCreditsPage = lazyPage(() => import("@/pages/ai-credits"), <AiCreditsPageSkeleton />);
const LandingPage = lazyPage(() => import("@/pages/landing"));
const SlashTabletPage = lazyPage(() => import("@/pages/slash-tablet"));
const TabletLinkPage = lazyPage(() => import("@/pages/slash-tablet/tablet-link"));
const NotFound = lazyPage(() => import("@/pages/not-found"));
const AdminCalendarPage = lazyPage(() => import("@/pages/admin-calendar"), <AdminCalendarPageSkeleton />);
const AdminAppointmentNewPage = lazyPage(() => import("@/pages/admin-appointment-new"), <AppointmentNewPageSkeleton />);
const AdminFinancePage = lazyPage(() => import("@/pages/admin-finance"), <AdminFinancePageSkeleton />);
const PayrollMyPage = lazyPage(() => import("@/pages/payroll-my"), <PayrollMyPageSkeleton />);
const PlanPaywall = lazyWithChunkRecovery(() => import("@/components/billing/plan-paywall"));

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
    return <AuthSessionSkeleton />;
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

      {/* Doctor dashboard (doctor, assistant, nurse) */}
      <Route path="/dashboard/doctor">
        <ProtectedRoute component={DoctorDashboard} allowedRoles={[...CLINICAL_STAFF_ROLES]} />
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
        <ProtectedRoute component={PatientsPage} allowedRoles={['owner', 'admin', ...CLINICAL_STAFF_ROLES, 'accountant']} />
      </Route>
      <Route path="/patients/:patientId/teeth/:fdi">
        <ProtectedRoute component={ToothDetailPage} allowedRoles={['owner', 'admin', ...CLINICAL_STAFF_ROLES]} />
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
        <ProtectedRoute component={ServicesPage} allowedRoles={['owner', 'admin', ...CLINICAL_STAFF_ROLES, 'accountant']} />
      </Route>

      {/* Clinical schedule (read-only calendar) */}
      <Route path="/schedule">
        <ProtectedRoute component={DoctorSchedulePage} allowedRoles={[...CLINICAL_STAFF_ROLES]} />
      </Route>
      <Route path="/schedule/:date">
        <ProtectedRoute component={DoctorScheduleDayPage} allowedRoles={[...CLINICAL_STAFF_ROLES]} />
      </Route>
      <Route path="/payroll/my">
        <ProtectedRoute component={PayrollMyPage} allowedRoles={[...CLINICAL_STAFF_ROLES]} />
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
      <Route path="/users/ratings">
        <ProtectedRoute component={DoctorRatingsPage} allowedRoles={['owner', 'admin']} />
      </Route>
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
        <ProtectedRoute component={MenuPage} allowedRoles={['owner', 'admin', ...CLINICAL_STAFF_ROLES, 'accountant', 'warehouse']} />
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
        <ProtectedRoute component={AiCreditsPage} allowedRoles={['owner']} />
      </Route>

      {/* Account settings pages */}
      <Route path="/account-settings">
        <ProtectedRoute component={AccountSettingsPage} allowedRoles={['owner', 'admin', ...CLINICAL_STAFF_ROLES, 'accountant', 'warehouse']} />
      </Route>
      <Route path="/account/edit-profile">
        <ProtectedRoute component={AccountEditProfilePage} allowedRoles={['owner', 'admin', ...CLINICAL_STAFF_ROLES, 'accountant', 'warehouse']} />
      </Route>
      <Route path="/account/change-email">
        <ProtectedRoute component={AccountChangeEmailPage} allowedRoles={['owner', 'admin', ...CLINICAL_STAFF_ROLES, 'accountant', 'warehouse']} />
      </Route>
      <Route path="/account/change-password">
        <ProtectedRoute component={AccountChangePasswordPage} allowedRoles={['owner', 'admin', ...CLINICAL_STAFF_ROLES, 'accountant', 'warehouse']} />
      </Route>

      {/* 404 */}
      <Route path="/:rest*" component={NotFound} />
    </Switch>
    </>
  );
}

function App() {
  useEffect(() => {
    const cleanup = installGlobalErrorHandlers("dental-crm");
    clearChunkReloadFlag();
    return cleanup;
  }, []);

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
