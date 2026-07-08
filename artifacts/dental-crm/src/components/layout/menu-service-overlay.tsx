import { Suspense } from "react";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/hooks/use-auth";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";
import { getMenuServiceBySlug } from "@/lib/menu-services";
import { isGeoRestrictedPath } from "@/lib/geo-restriction";
import { MenuServiceSheet } from "@/components/layout/menu-service-sheet";
import { MenuServiceContentSkeleton } from "@/components/skeletons/menu-service-content-skeleton";

export function MenuServiceOverlay() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { activeSlug, dismiss } = useOverlayNavigation();
  const { isRestricted, hasBranches, activeBranch } = useGeoRestriction();

  const service = getMenuServiceBySlug(activeSlug);
  const roleAllowed =
    !!service && !!user && service.roles.includes(user.role);

  const geoBlocked =
    !!service &&
    isRestricted &&
    hasBranches &&
    isGeoRestrictedPath(service.href);

  const open = roleAllowed;

  const handleOpenChange = (next: boolean) => {
    if (!next) dismiss();
  };

  const title = service ? t(service.nameKey) : "";

  return (
    <MenuServiceSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
    >
      {service && roleAllowed ? (
        geoBlocked ? (
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
        ) : (
          <Suspense
            key={service.slug}
            fallback={
              <MenuServiceContentSkeleton variant={service.skeletonVariant} />
            }
          >
            <service.component />
          </Suspense>
        )
      ) : null}
    </MenuServiceSheet>
  );
}

/** Open a service overlay from the current page (menu, dashboard, etc.). */
export function useOpenMenuService() {
  const { openService } = useOverlayNavigation();
  return openService;
}
