/** Paths that require the user to be inside a clinic geo-zone (non-owners). */
export const GEO_RESTRICTED_PREFIXES = [
  "/patients",
  "/calendar",
  "/analytics",
  "/doctor-analytics",
  "/financials",
  "/services",
  "/inventory",
  "/warehouse",
  "/users",
  "/chatbot",
  "/customer-care",
  "/staff",
  "/channels",
  "/migration",
  "/contract-templates",
] as const;

/** Accessible outside the clinic geo-zone (schedule + WhatsApp chat). */
export const GEO_ALLOWED_OUTSIDE_PREFIXES = ["/schedule", "/chat"] as const;

export function isGeoRestrictedPath(path: string): boolean {
  if (
    GEO_ALLOWED_OUTSIDE_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    return false;
  }

  return GEO_RESTRICTED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
