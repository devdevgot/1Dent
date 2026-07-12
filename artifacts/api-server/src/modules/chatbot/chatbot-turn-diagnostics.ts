import { logger } from "../../lib/logger";
import type { ChatMessage } from "./ai-classifier";

export type ChatbotEarlyExitReason =
  | "agent_turn"
  | "bot_disabled"
  | "credits_exhausted"
  | "done_state"
  | "human_takeover"
  | "legacy_fsm"
  | "no_response"
  | "operator_request"
  | "plan_limit"
  | "post_op_complaint"
  | "post_op_ok"
  | "repeat_sale_negative"
  | "repeat_sale_prompt";

export interface ChatbotTurnDiagnostics {
  clinicId: string;
  phoneCanonical: string;
  phoneRaw: string;
  channel: "playground" | "whatsapp";
  dryRun: boolean;
  sessionState: string;
  sessionHumanTakeover: boolean;
  patientStatus?: string | null;
  messageText: string;
  historyCount: number;
  historyPreview: string[];
  historyAgeMs: number | null;
  knowledgeContextLength: number;
  earlyExitReason?: ChatbotEarlyExitReason;
  agentUsed: boolean;
  doneReopened?: boolean;
  takeoverAutoReset?: boolean;
}

export function buildHistoryPreview(messages: ChatMessage[], limit = 4): string[] {
  return messages.slice(-limit).map((m) => `${m.role}:${m.content.slice(0, 80)}`);
}

export function computeHistoryAgeMs(messages: Array<{ createdAt?: Date | string }>): number | null {
  if (messages.length < 2) return null;
  const first = messages[0]?.createdAt;
  const last = messages[messages.length - 1]?.createdAt;
  if (!first || !last) return null;
  return new Date(last).getTime() - new Date(first).getTime();
}

export function logChatbotTurnDiagnostics(diag: ChatbotTurnDiagnostics): void {
  logger.info(diag, "[ChatbotTurnDiag]");
}
