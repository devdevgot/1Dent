import { logger } from "../../lib/logger";
import { runDentalBroadcastForAllClinics } from "./dental-broadcast.service";

const INTERVAL_MS = 30 * 60 * 1000;

// Dates are evaluated in UTC throughout (scheduler and runDate storage use toISOString().slice(0,10)).
// UTC+5 (Kazakhstan Standard Time) means midnight UTC = 5:00 AM local, so the 30-min tick window
// starting at 00:00 UTC on the 15th/last-day will fire within the correct calendar day locally.
function isScheduledDay(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDate();
  const utcLastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return utcDay === 15 || utcDay === utcLastDay;
}

async function tick(): Promise<void> {
  if (!isScheduledDay()) return;
  logger.info("[DentalBroadcastScheduler] Scheduled day detected — launching broadcast for all clinics");
  try {
    await runDentalBroadcastForAllClinics();
  } catch (err) {
    logger.error({ err }, "[DentalBroadcastScheduler] Error running broadcast");
  }
}

export function startDentalBroadcastScheduler(): void {
  logger.info("[DentalBroadcastScheduler] Started — polling every 30 minutes");
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "[DentalBroadcastScheduler] Tick error"));
  }, INTERVAL_MS);
  tick().catch((err) => logger.error({ err }, "[DentalBroadcastScheduler] Initial tick error"));
}
