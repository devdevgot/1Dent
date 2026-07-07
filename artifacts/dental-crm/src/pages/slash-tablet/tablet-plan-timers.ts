const TIMER_PREFIX = "1dent:timer:";
const DURATION_PREFIX = "1dent:timer-duration:";

export function readPlanItemTimers(itemIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const id of itemIds) {
    try {
      const raw = localStorage.getItem(`${TIMER_PREFIX}${id}`);
      if (!raw) continue;
      const ts = parseInt(raw, 10);
      if (!Number.isNaN(ts)) map.set(id, ts);
    } catch {
      /* ignore */
    }
  }
  return map;
}

export function startPlanItemTimer(itemId: string) {
  try {
    localStorage.setItem(`${TIMER_PREFIX}${itemId}`, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearPlanItemTimer(itemId: string) {
  try {
    localStorage.removeItem(`${TIMER_PREFIX}${itemId}`);
    localStorage.removeItem(`${DURATION_PREFIX}${itemId}`);
  } catch {
    /* ignore */
  }
}

export function formatElapsed(startedAt: number): string {
  const totalSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
