import { sendToPatient, sendTypingToPatient } from "../../shared/messaging";
import { logger } from "../../lib/logger";
import {
  type ChatbotReply,
  normalizeReply,
  estimateTypingPause,
} from "./chatbot-reply-format";

export type { ChatbotReply } from "./chatbot-reply-format";
export {
  HUMAN_MESSAGING_PROMPT,
  replyFromText,
  joinChatbotReply,
  mergeReply,
  appendToReply,
  normalizeReply,
  parseChatbotReplyJson,
  defaultPauses,
  estimateTypingPause,
} from "./chatbot-reply-format";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deliver reply as sequential WhatsApp bubbles with typing indicator and human-like pauses. */
export async function deliverChatbotReply(
  clinicId: string,
  phone: string,
  reply: ChatbotReply,
  opts?: { onPartDelivered?: (part: string) => Promise<void> },
): Promise<void> {
  const normalized = normalizeReply(reply);
  if (normalized.parts.length === 0) return;

  try {
    for (let i = 0; i < normalized.parts.length; i++) {
      const part = normalized.parts[i]!;
      const pause = normalized.pausesMs?.[i] ?? (i === 0 ? 0 : estimateTypingPause(normalized.parts[i - 1]!));

      if (pause > 0) {
        await sendTypingToPatient(clinicId, phone, true).catch(() => {});
        await sleep(pause);
      } else if (i === 0) {
        await sendTypingToPatient(clinicId, phone, true).catch(() => {});
      }

      await opts?.onPartDelivered?.(part).catch((err) =>
        logger.warn({ err }, "[ChatbotReply] onPartDelivered failed"),
      );
      await sendToPatient(clinicId, phone, part).catch((err) =>
        logger.error({ err, partIndex: i }, "[ChatbotReply] failed to send part"),
      );
    }
  } finally {
    await sendTypingToPatient(clinicId, phone, false).catch(() => {});
  }
}
