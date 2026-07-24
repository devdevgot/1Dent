/**
 * Periodic tick for Customer Care Chatbot outbound jobs (Phase 1).
 * Started from api-server index alongside the booking inactivity scheduler.
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
  // Kick once shortly after boot so due jobs don't wait a full minute.
  setTimeout(() => {
    customerCareChatbotService.processDueJobs().catch((err) =>
      logger.warn({ err }, "[CustomerCare] initial processDueJobs failed"),
    );
  }, 15_000);
  logger.info("[CustomerCare] scheduler registered");
}

export function stopCustomerCareScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
