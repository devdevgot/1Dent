const DEFAULT_CANONICAL_HOST = "www.1dent.kz";

function readCanonicalHostFromEnv(): string | null {
  for (const key of ["FRONTEND_URL", "PUBLIC_URL", "WEBHOOK_BASE_URL"] as const) {
    const raw = process.env[key]?.trim();
    if (!raw) continue;
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      continue;
    }
  }
  return null;
}

export function getCanonicalHost(): string {
  return readCanonicalHostFromEnv() ?? DEFAULT_CANONICAL_HOST;
}

export function normalizeRequestHost(host: string | undefined): string {
  return (host ?? "").split(":")[0]?.trim().toLowerCase() ?? "";
}

/** True when the request host should be redirected to the canonical host (e.g. apex → www). */
export function shouldRedirectToCanonicalHost(requestHost: string, canonicalHost = getCanonicalHost()): boolean {
  const host = normalizeRequestHost(requestHost);
  if (!host || host === canonicalHost) return false;

  const apexHost = canonicalHost.replace(/^www\./, "");
  return host === apexHost;
}

export function buildCanonicalRedirectUrl(
  requestHost: string,
  originalUrl: string,
  opts?: { protocol?: string; canonicalHost?: string },
): string | null {
  const canonicalHost = opts?.canonicalHost ?? getCanonicalHost();
  if (!shouldRedirectToCanonicalHost(requestHost, canonicalHost)) return null;

  const protocol = (opts?.protocol ?? "https").split(",")[0]?.trim() || "https";
  const path = originalUrl.startsWith("/") ? originalUrl : `/${originalUrl}`;
  return `${protocol}://${canonicalHost}${path}`;
}
