import { Suspense, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { MapPin } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/hooks/use-auth";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";
import { getMenuServiceBySlug } from "@/lib/menu-services";
import { isGeoRestrictedPath } from "@/lib/geo-restriction";
import { MenuServiceSheet } from "@/components/layout/menu-service-sheet";
import { MenuServiceContentSkeleton } from "@/components/skeletons/menu-service-content-skeleton";
import { findCachedStaffUser } from "@workspace/api-client-react";
import { lazyWithChunkRecovery } from "@/lib/chunk-reload";

const StaffDetailPage = lazyWithChunkRecovery(() => import("@/pages/staff-detail"));
const StaffAnalyticsPage = lazyWithChunkRecovery(() => import("@/pages/staff-analytics"));
const DoctorScheduleDayPage = lazyWithChunkRecovery(() => import("@/pages/doctor-schedule-day"));

export function MenuServiceOverlay() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const {
    activeSlug,
    detailId,
    scheduleDate,
    staffTab,
    stackDepth,
    dismiss,
    popStack,
    isOverlay,
  } = useOverlayNavigation();
  const { isRestricted, hasBranches, activeBranch } = useGeoRestriction();

  const service = getMenuServiceBySlug(activeSlug);
  const roleAllowed =
    !!service && !!user && service.roles.includes(user.role);

  const geoBlocked =
    !!service &&
    isRestricted &&
    hasBranches &&
    isGeoRestrictedPath(service.href);

  const open = isOverlay;

  const handleOpenChange = (next: boolean) => {
    if (!next) dismiss();
  };

  const cachedStaff = useMemo(
    () => (detailId ? findCachedStaffUser(queryClient, detailId) : undefined),
    [queryClient, detailId],
  );

  const { title, subtitle } = useMemo(() => {
    if (!service) return { title: "", subtitle: undefined };

    if (detailId && cachedStaff?.name) {
      return {
        title: cachedStaff.name,
        subtitle: t("nav.users"),
      };
    }

    if (scheduleDate) {
      try {
        const d = parseISO(scheduleDate);
        return {
          title: format(d, "d MMMM yyyy", { locale: ru }),
          subtitle: t("nav.schedule"),
        };
      } catch {
        return { title: t("nav.schedule"), subtitle: undefined };
      }
    }

    return {
      title: t(service.nameKey),
      subtitle: undefined,
    };
  }, [service, detailId, cachedStaff, scheduleDate, t]);

  const contentKey = `${activeSlug}-${detailId ?? ""}-${scheduleDate ?? ""}-${staffTab}`;

  const renderBody = () => {
    if (!service || !roleAllowed) return null;

    if (geoBlocked) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--warning-light)] flex items-center justify-center">
            <MapPin className="w-8 h-8 text-[#d97706]" />
          </div>
          <div>
            <h2 className="text-[17px] font-semibold text-[#0f172a] mb-1">
              Вы вне клиники
            </h2>
            <p className="text-xs text-[#64748b] leading-relaxed">
              Этот раздел доступен только когда вы находитесь в клинике.
              {activeBranch ? ` Ближайший филиал: ${activeBranch.name}` : null}
            </p>
          </div>
        </div>
      );
    }

    if (service.supportsDetail && detailId) {
      if (staffTab === "analytics") {
        return (
          <Suspense fallback={<MenuServiceContentSkeleton variant="analytics" />}>
            <StaffAnalyticsPage overlayDoctorId={detailId} />
          </Suspense>
        );
      }
      return (
        <Suspense fallback={<MenuServiceContentSkeleton variant="users" />}>
          <StaffDetailPage overlayDoctorId={detailId} />
        </Suspense>
      );
    }

    if (service.supportsDate && scheduleDate) {
      return (
        <Suspense fallback={<MenuServiceContentSkeleton variant="schedule" />}>
          <DoctorScheduleDayPage overlayDate={scheduleDate} />
        </Suspense>
      );
    }

    const Page = service.component;
    return (
      <Suspense
        fallback={
          <MenuServiceContentSkeleton variant={service.skeletonVariant} />
        }
      >
        <Page />
      </Suspense>
    );
  };

  return (
    <MenuServiceSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      subtitle={subtitle}
      onStackBack={stackDepth > 0 ? popStack : undefined}
    >
      <div key={contentKey} className="flex flex-col flex-1 min-h-0">
        {renderBody()}
      </div>
    </MenuServiceSheet>
  );
}

export function useOpenMenuService() {
  const { openService } = useOverlayNavigation();
  return openService;
}
