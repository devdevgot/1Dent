let _initData = "";

export function setInitData(data: string) {
  _initData = data;
}

export function getInitData(): string {
  return _initData;
}

const BASE = "/api/tma";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": _initData || "dev",
  };

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export interface TmaUser {
  telegramUserId: string;
  name: string;
  isAdmin: boolean;
}

export interface Clinic {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
  usersCount?: number;
  patientsCount?: number;
}

export interface DashboardData {
  totalClinics: number;
  totalUsers: number;
  totalPatients: number;
  revenueThisMonth: number;
  totalChatbotSessions: number;
  recentClinics: Clinic[];
}

export interface PlatformAdmin {
  id: string;
  telegramUserId: string;
  name: string;
  addedBy: string | null;
  createdAt: string;
}

export interface LogEntry {
  id: string;
  clinicId?: string;
  actionType: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
}

export interface ChatbotSession {
  id: string;
  clinicId?: string;
  phone: string;
  state: string;
  humanTakeover: boolean;
  updatedAt: string;
}

export interface ChatbotMessage {
  id: string;
  clinicId?: string;
  phone: string;
  direction: "inbound" | "outbound";
  content: string;
  createdAt: string;
}
