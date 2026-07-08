import { useLocation } from "wouter";

/** True when the app is on the SlashTablet route (`/tablet`, `/tablet?...`). */
export function useIsSlashTablet(): boolean {
  const [location] = useLocation();
  return isSlashTabletPath(location);
}

export function isSlashTabletPath(path: string): boolean {
  return path === "/tablet" || path.startsWith("/tablet?");
}
