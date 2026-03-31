import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { getRoleDashboardPath } from "@/lib/role-redirect";

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
import KanbanPage from "@/pages/kanban";
import PatientsPage from "@/pages/patients";
import ToothDetailPage from "@/pages/tooth-detail";
import ChatPage from "@/pages/chat";
import AnalyticsPage from "@/pages/analytics";
import InventoryPage from "@/pages/inventory";
import ProceduresPage from "@/pages/procedures";
import LogsPage from "@/pages/logs";
import FinancialsPage from "@/pages/financials";
import WarehousePage from "@/pages/warehouse";
import UsersPage from "@/pages/users";
import ChatbotPage from "@/pages/chatbot";
import MigrationPage from "@/pages/migration";
import StaffPage from "@/pages/staff";
import StaffDetailPage from "@/pages/staff-detail";
import DoctorAnalyticsPage from "@/pages/doctor-analytics";
import MenuPage from "@/pages/menu";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setAuth, clearAuth, setLoading } = useAuthStore();

  const { data, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      refetchOnWindowFocus: false,
    }
  });

  useEffect(() => {
    if (isLoading) {
      setLoading(true);
    } else if (data?.success && data.data) {
      setAuth(data.data.user, data.data.clinic);
    } else {
      clearAuth();
    }
  }, [data, isLoading, error, setAuth, clearAuth, setLoading]);

  if (isLoading) {
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

function Router() {
  const { isAuthenticated, user } = useAuthStore();
  const [location, setLocation] = useLocation();

  const roleDashboard = user ? getRoleDashboardPath(user.role) : "/dashboard";

  useEffect(() => {
    if (isAuthenticated && (location === "/login" || location === "/register")) {
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

      {/* Kanban board */}
      <Route path="/kanban">
        <ProtectedRoute component={KanbanPage} allowedRoles={['owner', 'admin', 'doctor']} />
      </Route>

      {/* Feature Routes */}
      <Route path="/patients">
        <ProtectedRoute component={PatientsPage} allowedRoles={['owner', 'admin', 'doctor']} />
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
      <Route path="/procedures">
        <ProtectedRoute component={ProceduresPage} allowedRoles={['owner', 'admin', 'doctor', 'accountant']} />
      </Route>
      <Route path="/logs">
        <ProtectedRoute component={LogsPage} allowedRoles={['owner']} />
      </Route>
      <Route path="/financials">
        <ProtectedRoute component={FinancialsPage} allowedRoles={['owner', 'accountant']} />
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
        <ProtectedRoute component={ChatbotPage} allowedRoles={['owner', 'admin']} />
      </Route>

      {/* Data migration */}
      <Route path="/migration">
        <ProtectedRoute component={MigrationPage} allowedRoles={['owner', 'admin']} />
      </Route>

      {/* Staff management */}
      <Route path="/staff">
        <ProtectedRoute component={StaffPage} allowedRoles={['owner', 'admin']} />
      </Route>
      <Route path="/staff/:doctorId">
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

      {/* 404 */}
      <Route path="/:rest*" component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
