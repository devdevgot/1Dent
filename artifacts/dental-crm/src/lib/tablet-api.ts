import { customFetch, ApiError } from "@workspace/api-client-react";

export interface TabletCabinetBrief {
  id: string;
  name: string;
}

export interface TabletDoctorBrief {
  id: string;
  name: string;
  specialty?: string | null;
  avatarColor: string;
}

export interface TabletSessionCreateResult {
  sessionId: string;
  linkToken: string;
  linkUrl: string;
  expiresAt: string;
  cabinet: TabletCabinetBrief;
}

export interface TabletSessionStatus {
  sessionId: string;
  status: "pending" | "unlocked" | "expired";
  cabinet: TabletCabinetBrief;
  doctor?: TabletDoctorBrief | null;
  expiresAt: string;
  unlockedAt?: string | null;
}

const CABINET_KEY = "1dent:tablet-cabinet-id";

export function getStoredCabinetId(): string | null {
  try {
    return localStorage.getItem(CABINET_KEY);
  } catch {
    return null;
  }
}

export function storeCabinetId(id: string) {
  try {
    localStorage.setItem(CABINET_KEY, id);
  } catch {
    /* ignore */
  }
}

export function applyCabinetIdToUrl(id: string) {
  storeCabinetId(id);
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("cabinet", id);
  window.history.replaceState({}, "", url.toString());
}

export async function resolveCabinetByPairingCode(code: string) {
  const digits = code.replace(/\D/g, "");
  return customFetch<{
    success: boolean;
    data: { cabinet: TabletCabinetBrief & { pairingCode?: string | null } };
  }>(`/api/tablet/public/cabinets/by-pairing/${encodeURIComponent(digits)}`);
}

export function resolveCabinetIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const fromQuery = new URLSearchParams(window.location.search).get("cabinet");
  if (fromQuery) {
    storeCabinetId(fromQuery);
    return fromQuery;
  }
  return getStoredCabinetId();
}

export function parseTabletLinkToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = trimmed.startsWith("http") ? new URL(trimmed) : new URL(trimmed, window.location.origin);
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch {
    /* not a url */
  }
  if (trimmed.length >= 8 && !trimmed.includes(" ")) return trimmed;
  return null;
}

export async function createTabletSession(cabinetId: string) {
  return customFetch<{ success: boolean; data: TabletSessionCreateResult }>(
    "/api/tablet/public/sessions",
    { method: "POST", body: JSON.stringify({ cabinetId }) },
  );
}

export async function getTabletSessionStatus(sessionId: string) {
  return customFetch<{ success: boolean; data: TabletSessionStatus }>(
    `/api/tablet/public/sessions/${sessionId}`,
  );
}

export async function verifyTabletCabinetPin(cabinetId: string, pin: string) {
  return customFetch<{ success: boolean }>(
    `/api/tablet/public/cabinets/${cabinetId}/verify-pin`,
    { method: "POST", body: JSON.stringify({ pin }) },
  );
}

export async function getTabletMe() {
  return customFetch<{ success: boolean; data: { hasTabletPin: boolean } }>("/api/tablet/me");
}

export async function setTabletPin(pin: string, linkToken?: string) {
  return customFetch<{ success: boolean; data: Record<string, unknown> }>(
    "/api/tablet/pin",
    { method: "POST", body: JSON.stringify({ pin, linkToken }) },
  );
}

export async function redeemTabletLink(token: string, pin?: string) {
  try {
    return await customFetch<{
      success: boolean;
      data: {
        sessionId: string;
        cabinet: TabletCabinetBrief | null;
        doctor: TabletDoctorBrief | null;
      };
    }>("/api/tablet/link", {
      method: "POST",
      body: JSON.stringify({ token, pin }),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 428) {
      const body = err.data as {
        error?: { code?: string; message?: string; linkToken?: string };
      } | null;
      const e = new Error(body?.error?.message ?? "Установите PIN-код") as Error & {
        code: string;
        linkToken: string;
      };
      e.code = body?.error?.code ?? "TABLET_PIN_SETUP_REQUIRED";
      e.linkToken = body?.error?.linkToken ?? token;
      throw e;
    }
    throw err;
  }
}

export async function listTabletCabinets() {
  return customFetch<{
    success: boolean;
    data: {
      cabinets: {
        id: string;
        name: string;
        tabletUrl: string;
        pairingCode?: string | null;
      }[];
    };
  }>("/api/tablet/cabinets");
}
