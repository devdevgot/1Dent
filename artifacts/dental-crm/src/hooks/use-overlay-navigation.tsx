import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useLocation, useSearch } from "wouter";

type OverlayNavigationContextValue = {
  isOverlay: boolean;
  activeSlug: string | null;
  openService: (slug: string, replace?: boolean) => void;
  dismiss: () => void;
};

const OverlayNavigationContext = createContext<OverlayNavigationContextValue>({
  isOverlay: false,
  activeSlug: null,
  openService: () => {},
  dismiss: () => {},
});

function buildUrl(path: string, search: string, mutate: (params: URLSearchParams) => void): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  mutate(params);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function OverlayNavigationProvider({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const path = location.split("?")[0];

  const params = useMemo(
    () => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search),
    [search],
  );
  const activeSlug = params.get("service");
  const isOverlay = !!activeSlug;

  const openService = useCallback(
    (slug: string, replace = false) => {
      const next = buildUrl(path, search, (p) => {
        p.set("service", slug);
      });
      navigate(next, { replace });
    },
    [navigate, path, search],
  );

  const dismiss = useCallback(() => {
    const next = buildUrl(path, search, (p) => {
      p.delete("service");
    });
    navigate(next, { replace: true });
  }, [navigate, path, search]);

  const value = useMemo(
    () => ({ isOverlay, activeSlug, openService, dismiss }),
    [isOverlay, activeSlug, openService, dismiss],
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
