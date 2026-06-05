import { getBaseUrl as getApiClientBaseUrl } from "@workspace/api-client-react";

export function getBaseUrl(): string {
  const apiBase = getApiClientBaseUrl();
  if (apiBase) return apiBase;
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}
