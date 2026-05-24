import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/hooks/use-auth";

export interface ClinicBranch {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export type GeoStatus = "loading" | "inside" | "outside" | "no_branches" | "denied" | "unavailable";

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in metres
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
    await fetch("/api/geo/event", {
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
    const res = await fetch("/api/branches", {
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

export function useGeoRestriction() {
  const { user } = useAuthStore();
  const [status, setStatus] = useState<GeoStatus>("loading");
  const [branches, setBranches] = useState<ClinicBranch[]>([]);
  const [activeBranch, setActiveBranch] = useState<ClinicBranch | null>(null);

  const prevInsideRef = useRef<boolean | null>(null);
  const prevBranchIdRef = useRef<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const branchesRef = useRef<ClinicBranch[]>([]);

  const isOwner = user?.role === "owner";

  // Load branches once on mount
  useEffect(() => {
    if (isOwner) {
      setStatus("no_branches");
      return;
    }
    fetchBranches().then((list) => {
      setBranches(list);
      branchesRef.current = list;
      if (list.length === 0) {
        setStatus("no_branches");
      }
    });
  }, [isOwner]);

  const handlePosition = useCallback((pos: GeolocationPosition) => {
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

    // Fire check-in / check-out event on transition
    if (prevInside !== null && prevInside !== inside) {
      const eventType = inside ? "checkin" : "checkout";
      const branchForEvent = inside ? nearest.branch : (list.find(b => b.id === prevBranchIdRef.current) ?? nearest.branch);
      void postGeoEvent(branchForEvent.id, eventType);
    } else if (prevInside === null && inside) {
      // First determination: fire checkin if inside
      void postGeoEvent(nearest.branch.id, "checkin");
    }

    prevInsideRef.current = inside;
    prevBranchIdRef.current = nearest.branch.id;
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
      setStatus("denied");
    } else {
      setStatus("unavailable");
    }
  }, []);

  // Start watching position once branches are loaded
  useEffect(() => {
    if (isOwner || branches.length === 0) return;
    if (!navigator.geolocation) {
      setStatus("unavailable");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 15000,
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [branches, isOwner, handlePosition, handleError]);

  // On unmount / tab hide — fire checkout if was inside
  useEffect(() => {
    if (isOwner) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && prevInsideRef.current && prevBranchIdRef.current) {
        void postGeoEvent(prevBranchIdRef.current, "checkout");
        prevInsideRef.current = false;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isOwner]);

  const isRestricted = !isOwner && status === "outside";
  const hasBranches = branches.length > 0;

  return { status, activeBranch, isRestricted, hasBranches, branches };
}
