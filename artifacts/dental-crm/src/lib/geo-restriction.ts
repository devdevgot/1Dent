/** Paths that require the user to be inside a clinic geo-zone (non-owners). */
export const GEO_RESTRICTED_PREFIXES = [
  "/patients",
  "/chat",
  "/analytics",
  "/doctor-analytics",
  "/financials",
  "/services",
  "/inventory",
  "/warehouse",
  "/users",
  "/chatbot",
  "/staff",
  "/channels",
  "/migration",
  "/contract-templates",
] as const;

export function isGeoRestrictedPath(path: string): boolean {
  return GEO_RESTRICTED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
