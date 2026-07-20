/**
 * Optimistic concurrency helpers for offline sync.
 *
 * Clients send `baseUpdatedAt` — the `updatedAt` they last observed.
 * If the server row changed since then, we reject with VERSION_CONFLICT
 * so the client can merge / ask the user instead of silently overwriting.
 */

export function toTimestampMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Returns true when the client's base timestamp still matches the server row.
 * Missing baseUpdatedAt keeps backwards-compatible last-write-wins for online clients.
 */
export function isBaseVersionCurrent(
  serverUpdatedAt: Date | string,
  baseUpdatedAt: Date | string | null | undefined,
): boolean {
  if (baseUpdatedAt == null || baseUpdatedAt === "") return true;
  const serverMs = toTimestampMs(serverUpdatedAt);
  const baseMs = toTimestampMs(baseUpdatedAt);
  if (serverMs == null || baseMs == null) return true;
  return serverMs === baseMs;
}
