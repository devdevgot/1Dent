import { logger } from "../../lib/logger";
import type { ClassificationResult } from "./ai-classifier";

export function logChatbotTurnMeta(meta: {
  clinicId: string;
  phone: string;
  state: string;
  usedFallback: boolean;
  promptChars?: number;
  classification?: ClassificationResult;
}): void {
  logger.info(meta, "[ChatbotTurn]");
}
