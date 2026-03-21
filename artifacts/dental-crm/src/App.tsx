import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { useGetMe } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/auth/protected-route";

// Pages
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setAuth, clearAuth, setLoading } = useAuthStore();
  const [location] = useLocation();
  
  // Only fetch /me if we are not on public routes (or we can always fetch to redirect logged in users)
  const isPublicRoute = location === "/login" || location === "/register";

  const { data, isLoading, error } = useGetMe({
    query: {
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
  const { isAuthenticated } = useAuthStore();
  const [location, setLocation] = useLocation();

  // Redirect authenticated users away from public routes
  useEffect(() => {
    if (isAuthenticated && (location === "/login" || location === "/register")) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, location, setLocation]);

  // Root redirect
  useEffect(() => {
    if (location === "/") {
      setLocation(isAuthenticated ? "/dashboard" : "/login");
    }
  }, [location, isAuthenticated, setLocation]);

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      
      {/* Protected Routes */}
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} allowedRoles={['owner', 'admin']} />
      </Route>
      <Route path="/dashboard/doctor">
        <ProtectedRoute component={Dashboard} allowedRoles={['doctor']} />
      </Route>
      <Route path="/dashboard/accountant">
        <ProtectedRoute component={Dashboard} allowedRoles={['accountant']} />
      </Route>
      <Route path="/dashboard/warehouse">
        <ProtectedRoute component={Dashboard} allowedRoles={['warehouse']} />
      </Route>

      {/* Feature Routes (WIP placeholders until Tasks #2-#8 complete) */}
      <Route path="/kanban">
        <ProtectedRoute component={() => <div className="p-4 bg-white rounded-xl shadow-sm border h-full">Kanban (WIP)</div>} allowedRoles={['owner', 'admin']} />
      </Route>
      <Route path="/patients">
        <ProtectedRoute component={() => <div className="p-4 bg-white rounded-xl shadow-sm border h-full">Patients (WIP)</div>} allowedRoles={['owner', 'admin', 'doctor']} />
      </Route>
      <Route path="/chat">
        <ProtectedRoute component={() => <div className="p-4 bg-white rounded-xl shadow-sm border h-full">Chat & Red Alert (WIP)</div>} allowedRoles={['owner', 'admin']} />
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
