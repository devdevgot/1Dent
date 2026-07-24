/**
 * Periodic tick for Customer Care Chatbot outbound jobs.
 * Not started from chatbot module — wire from api-server index when enabling Phase 1.
 */

import { logger } from "../../lib/logger";
import { customerCareChatbotService } from "./customer-care-chatbot.service";

const TICK_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;

export function startCustomerCareScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    customerCareChatbotService.processDueJobs().catch((err) =>
      logger.warn({ err }, "[CustomerCare] processDueJobs failed"),
    );
  }, TICK_MS);
  logger.info("[CustomerCare] scheduler registered (idle until jobs are wired)");
}

export function stopCustomerCareScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
