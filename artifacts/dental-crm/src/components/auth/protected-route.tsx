import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";

interface ProtectedRouteProps {
  component: React.ComponentType<any>;
  allowedRoles?: string[];
}

export function ProtectedRoute({ component: Component, allowedRoles = [] }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="mt-4 font-medium text-muted-foreground animate-pulse">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect in useEffect
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="w-20 h-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold font-display text-foreground">Access Denied</h2>
          <p className="text-muted-foreground mt-2 max-w-md">
            You do not have the required permissions to view this page. Please contact your clinic administrator.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}
