let _initData = "";

export function setInitData(data: string) {
  _initData = data;
}

export function getInitData(): string {
  return _initData;
}

const BASE = "/api/tma";

type ErrorSeverity = "error" | "warning" | "fatal";

function reportTmaError(payload: {
  message: string;
  severity?: ErrorSeverity;
  stack?: string | null;
  code?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  void fetch("/api/errors/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "tg-admin",
      severity: payload.severity ?? "error",
      message: payload.message,
      stack: payload.stack ?? null,
      code: payload.code ?? null,
      url: payload.url ?? (typeof window !== "undefined" ? window.location.href : null),
      metadata: payload.metadata ?? null,
    }),
  }).catch(() => {});
}

function reportHttpError(
  status: number,
  message: string,
  path: string,
  method: string,
  extra?: Record<string, unknown>,
) {
  reportTmaError({
    severity: status >= 500 ? "error" : "warning",
    message,
    code: `HTTP_${status}`,
    url: path.startsWith("/api") ? path : `${BASE}${path}`,
    metadata: { method, status, ...extra },
  });
}

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
    const message = (err as { error?: string }).error ?? `HTTP ${res.status}`;
    reportHttpError(res.status, message, `${BASE}${path}`, method, { body: err });
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    reportTmaError({
      message: event.message || "window.onerror",
      stack: event.error instanceof Error ? event.error.stack ?? null : null,
      url: event.filename || window.location.href,
      metadata: {
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportTmaError({
      severity: "error",
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack ?? null : null,
      code: "UNHANDLED_REJECTION",
    });
  });
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "X-Telegram-Init-Data": _initData || "dev",
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const message = (err as { error?: string }).error ?? `HTTP ${res.status}`;
    reportHttpError(res.status, message, `${BASE}${path}`, "POST", { body: err, upload: true });
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export interface TabletVideoSection {
  id: string;
  label: string;
  icon: string;
  relatedConditions: string[];
}

export interface TabletVideo {
  id: string;
  section: string;
  sectionLabel: string;
  title: string;
  description: string | null;
  mimeType: string;
  durationSec: number | null;
  fileSize: number | null;
  sortOrder: number;
  isActive: boolean;
  videoUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface TmaUser {
  telegramUserId: string;
  name: string;
  isAdmin: boolean;
}

export interface Clinic {
  id: string;
  name: string;
  plan: string;
  isActive: boolean;
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
  telegramUsername: string | null;
  name: string;
  addedBy: string | null;
  createdAt: string;
}

export interface LogEntry {
  id: string;
  clinicId?: string;
  userId?: string | null;
  actionType: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
}

export interface ErrorEventEntry {
  id: string;
  source: string;
  severity: string;
  message: string;
  stack: string | null;
  code: string | null;
  clinicId: string | null;
  userId: string | null;
  requestId: string | null;
  url: string | null;
  method: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  fingerprint: string | null;
  resolvedAt: string | null;
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

export interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface Broadcast {
  id: string;
  type: string;
  status: string;
  sendAt: string | null;
  title?: string | null;
  message?: string | null;
  sentCount?: number;
  failedCount?: number;
  createdAt: string;
}

export interface ClinicFile {
  id: string;
  name: string;
  type: string;
  source: string;
  url: string;
  createdAt: string;
}

export interface Contract {
  id: string;
  patientName: string;
  patientPhone: string;
  status: string;
  signedAt: string | null;
  createdAt: string;
}

export interface KnowledgeEntry {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
}
