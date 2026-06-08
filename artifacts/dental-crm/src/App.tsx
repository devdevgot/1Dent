
import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { useGetMe, getGetMeQueryKey, setUnauthorizedHandler, setBaseUrl } from "@workspace/api-client-react";
import { clearAuthToken, restoreAuthToken } from "@/lib/auth-token";
import type { User, Clinic } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { ErrorBoundary } from "@/components/error-boundary";

// Pages
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import OwnerDashboard from "@/pages/dashboard-owner";
import AdminDashboard from "@/pages/dashboard-admin";
import DoctorDashboard from "@/pages/dashboard-doctor";
import AccountantDashboard from "@/pages/dashboard-accountant";
import WarehouseDashboard from "@/pages/dashboard-warehouse";
import PatientsPage from "@/pages/patients";
import ToothDetailPage from "@/pages/tooth-detail";
import ChatPage from "@/pages/chat";
import AnalyticsPage from "@/pages/analytics";
import InventoryPage from "@/pages/inventory";
import ServicesPage from "@/pages/services";
import LogsPage from "@/pages/logs";
import FinancialsPage from "@/pages/financials";
import WarehousePage from "@/pages/warehouse";
import UsersPage from "@/pages/users";
import ChatbotPage from "@/pages/chatbot";
import StaffDetailPage from "@/pages/staff-detail";
import DoctorAnalyticsPage from "@/pages/doctor-analytics";
import DoctorSchedulePage from "@/pages/doctor-schedule";
import DoctorScheduleDayPage from "@/pages/doctor-schedule-day";
import AccountSettingsPage from "@/pages/account-settings";
import AccountEditProfilePage from "@/pages/account-edit-profile";
import AccountChangeEmailPage from "@/pages/account-change-email";
import AccountChangePasswordPage from "@/pages/account-change-password";
import MenuPage from "@/pages/menu";
import MigrationPage from "@/pages/migration";
import ChannelsPage from "@/pages/channels";
import ContractTemplatesPage from "@/pages/contract-templates";
import BranchesPage from "@/pages/branches";
import ClinicBranchesPage from "@/pages/clinic-branches";
import PricingPage from "@/pages/pricing";
import NotFound from "@/pages/not-found";

// Admin-specific pages
import AdminCalendarPage from "@/pages/admin-calendar";
import AdminAppointmentNewPage from "@/pages/admin-appointment-new";
import AdminFinancePage from "@/pages/admin-finance";
import PayrollMyPage from "@/pages/payroll-my";

const queryClient = new QueryClient();

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
  createdAt: new Date().toISOString(),
};

// Set API base URL to the hosted Replit backend
setBaseUrl("https://dental-crm-kz.replit.app");

// Restore auth token from localStorage on page load
restoreAuthToken();

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
      queryClient.clear();
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
    if (location === "/") {
      setLocation(isAuthenticated ? roleDashboard : "/login");
    }
  }, [location, isAuthenticated, setLocation, roleDashboard]);

  return (
    <Switch>
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
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}

export default App;
