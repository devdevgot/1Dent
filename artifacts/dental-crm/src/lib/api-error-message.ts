const INTERNAL_ERROR_TEXTS = new Set([
  "internal server error",
  "internal_server_error",
  "internal error",
]);

const NETWORK_ERROR_TEXTS = new Set([
  "load failed",
  "failed to fetch",
  "networkerror when attempting to fetch resource",
  "the internet connection appears to be offline",
  "network request failed",
]);

export function getApiErrorMessage(
  error: { data?: unknown; message?: string },
  fallback: string,
): string {
  const data = error.data as { error?: string; message?: string } | null | undefined;
  const candidate = data?.error?.trim() || data?.message?.trim() || error.message?.trim();
  if (!candidate) return fallback;
  if (INTERNAL_ERROR_TEXTS.has(candidate.toLowerCase())) return fallback;
  if (NETWORK_ERROR_TEXTS.has(candidate.toLowerCase())) {
    return "Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.";
  }
  return candidate;
}
