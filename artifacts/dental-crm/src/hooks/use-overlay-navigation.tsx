import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useLocation, useSearch } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { getMenuServiceBySlug } from "@/lib/menu-services";

export const OVERLAY_PARAM_SERVICE = "service";
export const OVERLAY_PARAM_DETAIL = "detail";
export const OVERLAY_PARAM_DATE = "date";

type OverlayNavigationContextValue = {
  /** True only while the service sheet is open and valid */
  isOverlay: boolean;
  activeSlug: string | null;
  detailId: string | null;
  scheduleDate: string | null;
  stackDepth: number;
  openService: (slug: string, replace?: boolean) => void;
  pushDetail: (id: string) => void;
  pushDate: (date: string, replace?: boolean) => void;
  popStack: () => void;
  dismiss: () => void;
};

const OverlayNavigationContext = createContext<OverlayNavigationContextValue>({
  isOverlay: false,
  activeSlug: null,
  detailId: null,
  scheduleDate: null,
  stackDepth: 0,
  openService: () => {},
  pushDetail: () => {},
  pushDate: () => {},
  popStack: () => {},
  dismiss: () => {},
});

function parseSearchParams(search: string) {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw);
}

function buildUrl(path: string, search: string, mutate: (params: URLSearchParams) => void): string {
  const params = parseSearchParams(search);
  mutate(params);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function OverlayNavigationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const path = location.split("?")[0];

  const params = useMemo(() => parseSearchParams(search), [search]);
  const activeSlug = params.get(OVERLAY_PARAM_SERVICE);
  const detailId = params.get(OVERLAY_PARAM_DETAIL);
  const scheduleDate = params.get(OVERLAY_PARAM_DATE);

  const service = getMenuServiceBySlug(activeSlug);
  const roleAllowed =
    !!service && !!user && service.roles.includes(user.role);

  const stackDepth = (detailId ? 1 : 0) + (scheduleDate ? 1 : 0);
  const isOverlay = roleAllowed;

  const dismiss = useCallback(() => {
    const next = buildUrl(path, search, (p) => {
      p.delete(OVERLAY_PARAM_SERVICE);
      p.delete(OVERLAY_PARAM_DETAIL);
      p.delete(OVERLAY_PARAM_DATE);
    });
    navigate(next, { replace: true });
  }, [navigate, path, search]);

  useEffect(() => {
    if (!activeSlug) return;
    if (!service || !roleAllowed) {
      dismiss();
    }
  }, [activeSlug, service, roleAllowed, dismiss]);

  const openService = useCallback(
    (slug: string, replace = false) => {
      const next = buildUrl(path, search, (p) => {
        p.set(OVERLAY_PARAM_SERVICE, slug);
        p.delete(OVERLAY_PARAM_DETAIL);
        p.delete(OVERLAY_PARAM_DATE);
      });
      navigate(next, { replace });
    },
    [navigate, path, search],
  );

  const pushDetail = useCallback(
    (id: string) => {
      const next = buildUrl(path, search, (p) => {
        p.set(OVERLAY_PARAM_DETAIL, id);
        p.delete(OVERLAY_PARAM_DATE);
      });
      navigate(next);
    },
    [navigate, path, search],
  );

  const pushDate = useCallback(
    (date: string, replace = false) => {
      const next = buildUrl(path, search, (p) => {
        p.set(OVERLAY_PARAM_DATE, date);
        p.delete(OVERLAY_PARAM_DETAIL);
      });
      navigate(next, { replace });
    },
    [navigate, path, search],
  );

  const popStack = useCallback(() => {
    if (detailId || scheduleDate) {
      const next = buildUrl(path, search, (p) => {
        p.delete(OVERLAY_PARAM_DETAIL);
        p.delete(OVERLAY_PARAM_DATE);
      });
      navigate(next, { replace: true });
      return;
    }
    dismiss();
  }, [detailId, scheduleDate, dismiss, navigate, path, search]);

  const value = useMemo(
    () => ({
      isOverlay,
      activeSlug,
      detailId,
      scheduleDate,
      stackDepth,
      openService,
      pushDetail,
      pushDate,
      popStack,
      dismiss,
    }),
    [
      isOverlay,
      activeSlug,
      detailId,
      scheduleDate,
      stackDepth,
      openService,
      pushDetail,
      pushDate,
      popStack,
      dismiss,
    ],
  );

  return (
    <OverlayNavigationContext.Provider value={value}>
      {children}
    </OverlayNavigationContext.Provider>
  );
}

export function useOverlayNavigation() {
  return useContext(OverlayNavigationContext);
}
