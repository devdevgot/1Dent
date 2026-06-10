const DEFAULT_PUBLIC_APP_URL = "https://1dent.kz";

/**
 * Base URL for patient-facing links (contract signing, public pages).
 * Uses the production app domain — not WEBHOOK_BASE_URL (API/webhook host).
 */
export function getPublicAppBaseUrl(): string {
  const fromPublic = process.env["PUBLIC_URL"]?.trim();
  if (fromPublic) return fromPublic.replace(/\/$/, "");

  const fromFrontend = process.env["FRONTEND_URL"]?.trim();
  if (fromFrontend) return fromFrontend.replace(/\/$/, "");

  return DEFAULT_PUBLIC_APP_URL;
}
