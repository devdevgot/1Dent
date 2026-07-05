const AUTH_ENTRY_PATHS = new Set(["/login", "/register", "/forgot-password", "/reset-password"]);

/** Same-origin relative path only — blocks open redirects like `//evil.com`. */
export function isSafeReturnTo(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\")) return false;

  const pathname = path.split(/[?#]/, 1)[0] ?? path;
  if (AUTH_ENTRY_PATHS.has(pathname)) return false;

  return true;
}

export function getPostLoginRedirectPath(
  returnTo: string | null | undefined,
  role: string,
  fallback: (role: string) => string,
): string {
  if (isSafeReturnTo(returnTo)) return returnTo;
  return fallback(role);
}
