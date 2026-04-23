export function getBaseUrl(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}
