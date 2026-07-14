import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";
import { PageShell } from "@/components/layout/page-shell";
import { StaffDetailPageSkeleton } from "@/components/skeletons";
import StaffDetailPage from "./staff-detail";

/**
 * Opens the per-employee analytics page for the current user.
 * In overlay mode renders inline; on a full-page route redirects to /users/:id.
 */
export default function StaffSelfAnalyticsPage() {
  const { user } = useAuthStore();
  const [, navigate] = useLocation();
  const { isOverlay } = useOverlayNavigation();

  useEffect(() => {
    if (!isOverlay && user?.id) {
      navigate(`/users/${user.id}`, { replace: true });
    }
  }, [isOverlay, user?.id, navigate]);

  if (!user?.id) {
    return (
      <PageShell className="h-full flex items-center justify-center" animate={false}>
        <StaffDetailPageSkeleton />
      </PageShell>
    );
  }

  if (isOverlay) {
    return <StaffDetailPage overlayDoctorId={user.id} />;
  }

  return (
    <PageShell className="h-full flex flex-col overflow-hidden" animate={false}>
      <StaffDetailPageSkeleton />
    </PageShell>
  );
}
