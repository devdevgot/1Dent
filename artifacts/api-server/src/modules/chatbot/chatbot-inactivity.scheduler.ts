import { logger } from "../../lib/logger";
import { ChatbotService } from "./chatbot.service";

const CHECK_INTERVAL_MS = 2 * 60 * 1000; // Check every 2 minutes

export function startChatbotInactivityScheduler(): void {
  const chatbotService = new ChatbotService();

  logger.info("[ChatbotInactivityScheduler] Started — checking for inactive sessions every 2 minutes");

  setInterval(async () => {
    try {
      await chatbotService.checkInactivityReminders();
      await chatbotService.checkLeadNurtureFollowups();
    } catch (err) {
      logger.error({ err }, "[ChatbotInactivityScheduler] Error checking inactivity/lead nurture reminders");
    }
  }, CHECK_INTERVAL_MS);
}
