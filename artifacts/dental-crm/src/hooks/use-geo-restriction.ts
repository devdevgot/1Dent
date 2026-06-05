import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import { getBaseUrl } from "@/lib/base-url";

export interface ClinicBranch {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export type GeoStatus = "loading" | "inside" | "outside" | "no_branches" | "denied" | "unavailable";

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

// ── sessionStorage helpers ──────────────────────────────────────────────────
// Persists geo state across page refreshes within the same browser tab.
// This prevents spurious checkin/checkout pairs on F5.

interface PersistedGeoState {
  inside: boolean;
  branchId: string | null;
  savedAt: number; // timestamp ms
}

function loadPersistedState(userId: string): PersistedGeoState | null {
  try {
    const raw = sessionStorage.getItem(`geo_state_${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedGeoState;
    // Discard if older than 2 hours (stale session)
    if (Date.now() - parsed.savedAt > 2 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedState(userId: string, inside: boolean, branchId: string | null) {
  try {
    const state: PersistedGeoState = { inside, branchId, savedAt: Date.now() };
    sessionStorage.setItem(`geo_state_${userId}`, JSON.stringify(state));
  } catch { /* non-critical */ }
}

function clearPersistedState(userId: string) {
  try { sessionStorage.removeItem(`geo_state_${userId}`); } catch { /* non-critical */ }
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
  // Track whether we restored state from sessionStorage (skip checkin on first fix)
  const restoredRef = useRef(false);

  const isOwner = user?.role === "owner";
  const userId = user?.id ?? "";

  // ── Restore persisted state on mount ─────────────────────────────────────
  useEffect(() => {
    if (isOwner || !userId) return;
    const saved = loadPersistedState(userId);
    if (saved) {
      prevInsideRef.current = saved.inside;
      prevBranchIdRef.current = saved.branchId;
      restoredRef.current = true;
    }
  }, [isOwner, userId]);

  // ── Load branches once on mount ───────────────────────────────────────────
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

    // Save to sessionStorage so page refresh doesn't lose state
    savePersistedState(userId, inside, nearest.branch.id);

    // ── Determine whether to fire a geo event ──────────────────────────────
    if (prevInside === null) {
      // First GPS fix after fresh page load (no prior sessionStorage state)
      if (inside && !restoredRef.current) {
        // Only fire checkin if we have NO persisted state (truly first visit this session)
        void postGeoEvent(nearest.branch.id, "checkin");
      }
      // If restoredRef is true, state was loaded from sessionStorage — no event needed,
      // the backend deduplication handles any edge cases.
    } else if (prevInside !== inside) {
      // Genuine transition: inside↔outside
      const eventType = inside ? "checkin" : "checkout";
      const branchForEvent = inside
        ? nearest.branch
        : (list.find(b => b.id === prevBranchIdRef.current) ?? nearest.branch);
      void postGeoEvent(branchForEvent.id, eventType);
    }

    prevInsideRef.current = inside;
    prevBranchIdRef.current = nearest.branch.id;
    restoredRef.current = false; // only skip on very first call
  }, [userId]);

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
      setStatus("denied");
    } else {
      setStatus("unavailable");
    }
  }, []);

  // ── Start watching position once branches are loaded ──────────────────────
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

  // ── Tab hide: fire checkout only for genuine tab closes, not page refreshes ──
  // Strategy: on hide, store a "pending checkout" with timestamp in sessionStorage.
  // On next page load, if the pending checkout is older than 20s, fire it
  // (page refresh would've loaded within ~5s; real close has no next load).
  // On tab becoming visible again, cancel the pending checkout.
  useEffect(() => {
    if (isOwner || !userId) return;

    const pendingKey = `geo_pending_checkout_${userId}`;

    // On mount: check if there's a pending checkout from a previous hide
    const pending = sessionStorage.getItem(pendingKey);
    if (pending) {
      sessionStorage.removeItem(pendingKey);
      try {
        const { branchId: pBranchId, ts } = JSON.parse(pending) as { branchId: string; ts: number };
        const ageMs = Date.now() - ts;
        // If the page reloaded within 20s → it was a refresh → skip checkout
        // (backend deduplication handles any edge case)
        if (ageMs > 20 * 1000) {
          void postGeoEvent(pBranchId, "checkout");
        }
      } catch { /* non-critical */ }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (prevInsideRef.current && prevBranchIdRef.current) {
          // Store pending checkout — don't fire immediately
          sessionStorage.setItem(pendingKey, JSON.stringify({
            branchId: prevBranchIdRef.current,
            ts: Date.now(),
          }));
          // Update persisted state to "outside" so refresh doesn't re-checkin
          savePersistedState(userId, false, prevBranchIdRef.current);
          prevInsideRef.current = false;
        }
      } else if (document.visibilityState === "visible") {
        // Tab came back — cancel any pending checkout
        sessionStorage.removeItem(pendingKey);
        // Restore inside state
        const saved = loadPersistedState(userId);
        if (saved?.inside) {
          prevInsideRef.current = true;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isOwner, userId]);

  // ── Clear state on logout ─────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      clearPersistedState(userId);
    }
  }, [userId]);

  const isRestricted = !isOwner && status === "outside";
  const hasBranches = branches.length > 0;

  return { status, activeBranch, isRestricted, hasBranches, branches };
}
