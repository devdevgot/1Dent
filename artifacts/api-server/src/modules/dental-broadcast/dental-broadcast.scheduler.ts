import { logger } from "../../lib/logger";
import { runDentalBroadcastForAllClinics } from "./dental-broadcast.service";

const INTERVAL_MS = 30 * 60 * 1000;

async function tick(): Promise<void> {
  logger.info("[DentalBroadcastScheduler] Tick — checking clinics in local timezone");
  try {
    await runDentalBroadcastForAllClinics();
  } catch (err) {
    logger.error({ err }, "[DentalBroadcastScheduler] Error running broadcast");
  }
}

export function startDentalBroadcastScheduler(): void {
  logger.info("[DentalBroadcastScheduler] Started — polling every 30 minutes (per-clinic timezone)");
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "[DentalBroadcastScheduler] Tick error"));
  }, INTERVAL_MS);
  tick().catch((err) => logger.error({ err }, "[DentalBroadcastScheduler] Initial tick error"));
}
