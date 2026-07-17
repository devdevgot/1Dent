import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import { getBaseUrl } from "@/lib/base-url";
import {
  clearPermissionPromptDismissed,
  markPermissionGranted,
  markPermissionPromptDismissed,
  refreshGeolocationSilently,
  requestGeolocationAccess,
  resolveDevicePermissionPhase,
  wasPermissionGrantedBefore,
  wasPermissionPromptDismissed,
  warmMediaPermissions,
} from "@/lib/device-permissions";
import { isPwaStandalone } from "@/lib/pwa";
import { GeoPermissionsPrompt } from "./geo-permissions-prompt";

export interface ClinicBranch {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export type GeoStatus = "loading" | "inside" | "outside" | "no_branches" | "denied" | "unavailable";

export type GeoPermissionPhase = "checking" | "prompt" | "granted" | "denied";

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getToken() {
  return localStorage.getItem("auth_token");
}

async function postGeoEvent(branchId: string, eventType: "checkin" | "checkout") {
  try {
    const token = getToken();
    await fetch(`${getBaseUrl()}/api/geo/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "include",
      body: JSON.stringify({ branchId, eventType }),
    });
  } catch {
    // Non-critical
  }
}

async function fetchBranches(): Promise<ClinicBranch[]> {
  try {
    const token = getToken();
    const res = await fetch(`${getBaseUrl()}/api/branches`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: "include",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { success: boolean; data: { branches: ClinicBranch[] } };
    return json.data?.branches ?? [];
  } catch {
    return [];
  }
}

function findNearestBranch(
  lat: number,
  lon: number,
  branches: ClinicBranch[],
): { branch: ClinicBranch; distance: number } | null {
  if (!branches.length) return null;
  let nearest: { branch: ClinicBranch; distance: number } | null = null;
  for (const b of branches) {
    const dist = haversineDistance(lat, lon, b.latitude, b.longitude);
    if (!nearest || dist < nearest.distance) {
      nearest = { branch: b, distance: dist };
    }
  }
  return nearest;
}

interface PersistedGeoState {
  inside: boolean;
  branchId: string | null;
  savedAt: number;
}

const GEO_STATE_TTL_MS = 24 * 60 * 60 * 1000;

function loadPersistedState(userId: string): PersistedGeoState | null {
  try {
    const raw = localStorage.getItem(`geo_state_${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedGeoState;
    if (Date.now() - parsed.savedAt > GEO_STATE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedState(userId: string, inside: boolean, branchId: string | null) {
  try {
    const state: PersistedGeoState = { inside, branchId, savedAt: Date.now() };
    localStorage.setItem(`geo_state_${userId}`, JSON.stringify(state));
  } catch {
    // non-critical
  }
}

function clearPersistedState(userId: string) {
  try {
    localStorage.removeItem(`geo_state_${userId}`);
  } catch {
    // non-critical
  }
}

type GeoTrackingContextValue = {
  status: GeoStatus;
  activeBranch: ClinicBranch | null;
  isRestricted: boolean;
  hasBranches: boolean;
  branches: ClinicBranch[];
  permissionPhase: GeoPermissionPhase;
  needsPermissionPrompt: boolean;
  requestGeolocationPermission: (options?: { warmMedia?: boolean }) => Promise<boolean>;
};

const GeoTrackingContext = createContext<GeoTrackingContextValue | null>(null);

export function GeoTrackingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();
  const [status, setStatus] = useState<GeoStatus>("loading");
  const [branches, setBranches] = useState<ClinicBranch[]>([]);
  const [activeBranch, setActiveBranch] = useState<ClinicBranch | null>(null);
  const [permissionPhase, setPermissionPhase] = useState<GeoPermissionPhase>("checking");
  const [promptDismissed, setPromptDismissed] = useState(() =>
    userId ? wasPermissionPromptDismissed(userId) : false,
  );

  const prevInsideRef = useRef<boolean | null>(null);
  const prevBranchIdRef = useRef<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const branchesRef = useRef<ClinicBranch[]>([]);
  const restoredRef = useRef(false);
  const permissionPhaseRef = useRef<GeoPermissionPhase>("checking");

  const isOwner = user?.role === "owner";
  const userId = user?.id ?? "";
  const trackingEnabled = !isOwner && branches.length > 0;

  permissionPhaseRef.current = permissionPhase;

  useEffect(() => {
    if (isOwner || !userId) return;
    const saved = loadPersistedState(userId);
    if (saved) {
      prevInsideRef.current = saved.inside;
      prevBranchIdRef.current = saved.branchId;
      restoredRef.current = true;
    }
  }, [isOwner, userId]);

  useEffect(() => {
    if (!userId || isOwner) {
      if (isOwner) {
        setStatus("no_branches");
        setPermissionPhase("granted");
      }
      return;
    }

    fetchBranches().then((list) => {
      setBranches(list);
      branchesRef.current = list;
      if (list.length === 0) {
        setStatus("no_branches");
        setPermissionPhase("granted");
      }
    });
  }, [isOwner, userId]);

  useEffect(() => {
    setPromptDismissed(userId ? wasPermissionPromptDismissed(userId) : false);
  }, [userId]);

  useEffect(() => {
    if (!trackingEnabled) return;

    let cancelled = false;

    void (async () => {
      const phase = await resolveDevicePermissionPhase("geolocation");
      if (cancelled) return;

      if (phase === "granted") {
        markPermissionGranted("geolocation");
        setPermissionPhase("granted");
        return;
      }

      if (phase === "denied") {
        setPermissionPhase("denied");
        setStatus("denied");
        return;
      }

      setPermissionPhase("prompt");
      setStatus("loading");
    })();

    return () => {
      cancelled = true;
    };
  }, [trackingEnabled]);

  const handlePosition = useCallback(
    (pos: GeolocationPosition) => {
      markPermissionGranted("geolocation");
      setPermissionPhase("granted");
      const { latitude, longitude } = pos.coords;
      const list = branchesRef.current;
      if (!list.length) {
        setStatus("no_branches");
        return;
      }

      const nearest = findNearestBranch(latitude, longitude, list);
      if (!nearest) return;

      const inside = nearest.distance <= nearest.branch.radiusMeters;
      const prevInside = prevInsideRef.current;

      if (inside) {
        setStatus("inside");
        setActiveBranch(nearest.branch);
      } else {
        setStatus("outside");
        setActiveBranch(null);
      }

      savePersistedState(userId, inside, nearest.branch.id);

      if (prevInside === null) {
        if (inside && !restoredRef.current) {
          void postGeoEvent(nearest.branch.id, "checkin");
        }
      } else if (prevInside !== inside) {
        const eventType = inside ? "checkin" : "checkout";
        const branchForEvent = inside
          ? nearest.branch
          : (list.find((b) => b.id === prevBranchIdRef.current) ?? nearest.branch);
        void postGeoEvent(branchForEvent.id, eventType);
      }

      prevInsideRef.current = inside;
      prevBranchIdRef.current = nearest.branch.id;
      restoredRef.current = false;
    },
    [userId],
  );

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
      void resolveDevicePermissionPhase("geolocation").then((phase) => {
        if (phase === "denied") {
          setPermissionPhase("denied");
          setStatus("denied");
          return;
        }

        if (phase === "granted" || wasPermissionGrantedBefore("geolocation")) {
          setPermissionPhase("granted");
          setStatus("unavailable");
          return;
        }

        setPermissionPhase("prompt");
        setStatus("loading");
      });
      return;
    }

    setStatus("unavailable");
  }, []);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 30_000,
      timeout: 20_000,
    });
  }, [handleError, handlePosition]);

  useEffect(() => {
    if (permissionPhase !== "granted" || !trackingEnabled) {
      stopWatching();
      return;
    }

    startWatching();
    return stopWatching;
  }, [permissionPhase, trackingEnabled, startWatching, stopWatching]);

  const requestGeolocationPermission = useCallback(
    async (options?: { warmMedia?: boolean }) => {
      if (!trackingEnabled) return true;

      try {
        const position = await requestGeolocationAccess();
        markPermissionGranted("geolocation");
        clearPermissionPromptDismissed(userId);
        setPermissionPhase("granted");
        setPromptDismissed(false);
        setStatus("loading");
        handlePosition(position);

        if (options?.warmMedia && isPwaStandalone()) {
          void warmMediaPermissions();
        }

        return true;
      } catch {
        const phase = await resolveDevicePermissionPhase("geolocation");
        if (phase === "denied") {
          setPermissionPhase("denied");
          setStatus("denied");
        } else if (phase === "granted") {
          setPermissionPhase("granted");
        } else {
          setPermissionPhase("prompt");
        }
        return false;
      }
    },
    [handlePosition, trackingEnabled, userId],
  );

  useEffect(() => {
    if (isOwner || !userId) return;

    const pendingKey = `geo_pending_checkout_${userId}`;
    const pending = sessionStorage.getItem(pendingKey);
    if (pending) {
      sessionStorage.removeItem(pendingKey);
      try {
        const { branchId: pBranchId, ts } = JSON.parse(pending) as { branchId: string; ts: number };
        if (Date.now() - ts > 20 * 1000) {
          void postGeoEvent(pBranchId, "checkout");
        }
      } catch {
        // non-critical
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (permissionPhaseRef.current !== "granted") return;

        if (prevInsideRef.current && prevBranchIdRef.current) {
          sessionStorage.setItem(
            pendingKey,
            JSON.stringify({ branchId: prevBranchIdRef.current, ts: Date.now() }),
          );
          savePersistedState(userId, false, prevBranchIdRef.current);
          prevInsideRef.current = false;
        }
        return;
      }

      if (document.visibilityState !== "visible") return;

      sessionStorage.removeItem(pendingKey);
      const saved = loadPersistedState(userId);
      if (saved?.inside) {
        prevInsideRef.current = true;
      }

      if (
        permissionPhaseRef.current !== "granted" &&
        wasPermissionGrantedBefore("geolocation")
      ) {
        setPermissionPhase("granted");
        permissionPhaseRef.current = "granted";
      }

      if (permissionPhaseRef.current !== "granted") return;

      stopWatching();
      startWatching();
      void refreshGeolocationSilently().then((position) => {
        if (position) handlePosition(position);
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isOwner, userId, stopWatching, startWatching, handlePosition]);

  useEffect(() => {
    if (!userId) {
      clearPersistedState(userId);
    }
  }, [userId]);

  const isRestricted = !isOwner && status === "outside";
  const hasBranches = branches.length > 0;
  const needsPermissionPrompt =
    trackingEnabled && permissionPhase === "prompt" && !promptDismissed;

  const value = useMemo<GeoTrackingContextValue>(
    () => ({
      status,
      activeBranch,
      isRestricted,
      hasBranches,
      branches,
      permissionPhase,
      needsPermissionPrompt,
      requestGeolocationPermission,
    }),
    [
      status,
      activeBranch,
      isRestricted,
      hasBranches,
      branches,
      permissionPhase,
      needsPermissionPrompt,
      requestGeolocationPermission,
    ],
  );

  return (
    <GeoTrackingContext.Provider value={value}>
      {children}
      {needsPermissionPrompt && (
        <GeoPermissionsPrompt
          onAllow={(warmMedia) => requestGeolocationPermission({ warmMedia })}
          onDismiss={() => {
            markPermissionPromptDismissed(userId);
            setPromptDismissed(true);
          }}
        />
      )}
    </GeoTrackingContext.Provider>
  );
}

export function useGeoTracking(): GeoTrackingContextValue {
  const ctx = useContext(GeoTrackingContext);
  if (!ctx) {
    throw new Error("useGeoTracking must be used within GeoTrackingProvider");
  }
  return ctx;
}

/** @deprecated Use useGeoTracking — kept for existing imports. */
export function useGeoRestriction(): GeoTrackingContextValue {
  return useGeoTracking();
}
