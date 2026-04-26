import { logger } from "../../lib/logger";
import { runDentalBroadcastForAllClinics } from "./dental-broadcast.service";

const INTERVAL_MS = 30 * 60 * 1000;

function isScheduledDay(): boolean {
  const now = new Date();
  const day = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return day === 15 || day === lastDay;
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
