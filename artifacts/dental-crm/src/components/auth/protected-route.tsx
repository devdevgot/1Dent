import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { AdminLayout } from "@/components/layout/admin-layout";
import { AuthShellSkeleton } from "@/components/skeletons";

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

interface ProtectedRouteProps {
  component: React.ComponentType<Record<string, never>>;
  allowedRoles?: string[];
  useAdminLayout?: boolean;
}

function LayoutWrapper({
  user,
  useAdminLayout,
  children,
}: {
  user: { role: string } | null;
  useAdminLayout?: boolean;
  children: React.ReactNode;
}) {
  const isAdmin = user?.role === "admin";
  if (isAdmin || useAdminLayout) {
    return <AdminLayout>{children}</AdminLayout>;
  }
  return <AppLayout>{children}</AppLayout>;
}

export function ProtectedRoute({ component: Component, allowedRoles = [], useAdminLayout }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (DEV_BYPASS) return;
    if (!isLoading && !isAuthenticated) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const loginPath =
        returnTo && returnTo !== "/login"
          ? `/login?returnTo=${encodeURIComponent(returnTo)}`
          : "/login";
      setLocation(loginPath);
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (!DEV_BYPASS && isLoading) {
    return <AuthShellSkeleton />;
  }

  if (!DEV_BYPASS && (!isAuthenticated || !user)) {
    return null;
  }

  if (!DEV_BYPASS && allowedRoles.length > 0 && user && !allowedRoles.includes(user.role)) {
    return (
      <LayoutWrapper user={user} useAdminLayout={useAdminLayout}>
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
      </LayoutWrapper>
    );
  }

  return (
    <LayoutWrapper user={user} useAdminLayout={useAdminLayout}>
      <Component />
    </LayoutWrapper>
  );
}
