import { getBaseUrl } from "@/lib/base-url";

function authHeaders(branchId: string | null): HeadersInit {
  const token = localStorage.getItem("auth_token");
  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(branchId ? { "x-clinic-branch-id": branchId } : {}),
  };
}

export async function fetchBranchScopedJson<T>(
  path: string,
  branchId: string | null,
  init?: RequestInit,
): Promise<T> {
  const base = getBaseUrl() ?? "";
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...authHeaders(branchId),
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchBranchRevenue(
  branchId: string | null,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const qs = new URLSearchParams({ dateFrom, dateTo });
  const json = await fetchBranchScopedJson<{
    data?: { analytics?: { revenueThisMonth?: number } };
  }>(`/api/analytics/owner/summary?${qs}`, branchId);
  return Number(json.data?.analytics?.revenueThisMonth ?? 0);
}
