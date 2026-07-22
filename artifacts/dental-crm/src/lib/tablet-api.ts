import { customFetch, ApiError } from "@workspace/api-client-react";
import type { User, Clinic } from "@workspace/api-client-react";

export interface TabletCabinetBrief {
  id: string;
  name: string;
}

export interface TabletDoctorBrief {
  id: string;
  name: string;
  specialty?: string | null;
  avatarColor: string;
  /** Cropped profile photo from CRM account settings (data URL or https). */
  photoUrl?: string | null;
}

export interface TabletSessionCreateResult {
  sessionId: string;
  linkToken: string;
  linkUrl: string;
  expiresAt: string;
  cabinet: TabletCabinetBrief | null;
  bootstrap?: boolean;
}

export interface TabletSessionStatus {
  sessionId: string;
  status: "pending" | "awaiting_pairing" | "unlocked" | "expired" | "released";
  cabinet: TabletCabinetBrief | null;
  doctor?: TabletDoctorBrief | null;
  pairingCode?: string | null;
  expiresAt: string;
  unlockedAt?: string | null;
  auth?: {
    token: string;
    user: User;
    clinic: Clinic;
  } | null;
}

export interface TabletUnlockResult {
  cabinet: TabletCabinetBrief;
  doctor: TabletDoctorBrief;
  auth: {
    token: string;
    user: User;
    clinic: Clinic;
  };
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

export function clearStoredCabinetId() {
  try {
    localStorage.removeItem(CABINET_KEY);
  } catch {
    /* ignore */
  }
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("cabinet")) return;
  url.searchParams.delete("cabinet");
  window.history.replaceState({}, "", url.toString());
}

type ApiErrorPayload = { code?: string; error?: string } | null;

export function getTabletApiErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const data = err.data as ApiErrorPayload;
  return data?.code ?? null;
}

/** True when the tablet should drop a cached cabinet id and bootstrap again. */
export function shouldResetTabletCabinetBinding(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  const code = getTabletApiErrorCode(err);
  if (code === "TABLET_CABINET_STALE") return true;
  if (err.status === 404 && code === "NOT_FOUND") return true;
  return false;
}

export function getTabletLinkErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : "Не удалось подключиться к планшету";
  }
  const code = getTabletApiErrorCode(err);
  if (code === "TABLET_NOT_PAIRED_BY_OWNER") {
    return err.message.replace(/^HTTP \d+[^:]*:\s*/, "");
  }
  if (code === "TABLET_CABINET_STALE") {
    return err.message.replace(/^HTTP \d+[^:]*:\s*/, "");
  }
  if (err.status === 404 && code === "NOT_FOUND") {
    return "Ссылка устарела или уже использована. На планшете нажмите «Обновить код» и отсканируйте новый QR.";
  }
  return err.message.replace(/^HTTP \d+[^:]*:\s*/, "");
}

export function isTabletNotPairedByOwnerError(err: unknown): boolean {
  return getTabletApiErrorCode(err) === "TABLET_NOT_PAIRED_BY_OWNER";
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

export async function createTabletSession(cabinetId?: string) {
  return customFetch<{ success: boolean; data: TabletSessionCreateResult }>(
    "/api/tablet/public/sessions",
    {
      method: "POST",
      body: JSON.stringify(cabinetId ? { cabinetId } : {}),
    },
  );
}

export async function getTabletSessionStatus(sessionId: string) {
  return customFetch<{ success: boolean; data: TabletSessionStatus }>(
    `/api/tablet/public/sessions/${sessionId}`,
  );
}

export async function getPendingTabletPairing() {
  return customFetch<{
    success: boolean;
    data: {
      sessionId: string;
      cabinet: TabletCabinetBrief;
    } | null;
  }>("/api/tablet/pending-pairing");
}

export async function unlockTabletByUserPin(cabinetId: string, pin: string) {
  return customFetch<{ success: boolean; data: TabletUnlockResult }>(
    `/api/tablet/public/cabinets/${cabinetId}/unlock-by-pin`,
    { method: "POST", body: JSON.stringify({ pin }) },
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

export interface TabletRedeemResult {
  pairingRequired?: boolean;
  ownerActionRequired?: boolean;
  sessionId: string;
  cabinet: TabletCabinetBrief | null;
  doctor: TabletDoctorBrief | null;
}

export async function enterTabletSession(sessionId: string) {
  return customFetch<{
    success: boolean;
    data: {
      sessionId: string;
      cabinet: TabletCabinetBrief;
      doctor: TabletDoctorBrief | null;
      auth?: TabletUnlockResult["auth"] | null;
    };
  }>("/api/tablet/link/enter", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function releaseTabletSession(sessionId: string) {
  return customFetch<{
    success: boolean;
    data: { sessionId: string };
  }>("/api/tablet/link/release", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function redeemTabletLink(token: string, pin?: string) {
  return customFetch<{
    success: boolean;
    data: TabletRedeemResult;
  }>("/api/tablet/link", {
    method: "POST",
    body: JSON.stringify({ token, pin }),
  });
}


export async function issueTabletPairingCode(cabinetId?: string) {
  return customFetch<{
    success: boolean;
    data: {
      cabinetId: string;
      name: string;
      pairingCode: string;
      tabletUrl: string;
      expiresInSeconds: number;
    };
  }>("/api/tablet/cabinets/pairing-code", {
    method: "POST",
    body: JSON.stringify(cabinetId ? { cabinetId } : {}),
  });
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
