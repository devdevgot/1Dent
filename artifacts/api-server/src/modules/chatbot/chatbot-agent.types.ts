import type { ChatbotState } from "./chatbot.types";

export type ChatbotAgentActionType =
  | "suggest_doctor"
  | "rerank_doctor"
  | "show_slots"
  | "set_branch"
  | "set_patient_name"
  | "parse_datetime"
  | "book_appointment"
  | "cancel_appointment"
  | "reschedule_appointment"
  | "handoff_operator";

export interface ChatbotAgentIntent {
  serviceType?: string;
  urgency?: "urgent" | "soon" | "planned";
  selectedBranch?: string | null;
  patientName?: string | null;
  preferredDatetime?: string | null;
  problemDescription?: string | null;
}

export interface ChatbotAgentAction {
  type: ChatbotAgentActionType;
  /** Exclude current doctor when reranking */
  excludeCurrentDoctor?: boolean;
  branch?: string;
  name?: string;
  datetimeText?: string;
}

/** Structured turn output from the LLM agent orchestrator. */
export interface ChatbotAgentTurn {
  reply: string;
  /** Target mind map node — must be reachable from current node */
  mindMapNodeId?: string | null;
  /** Derived FSM hint for analytics and FACTS filtering */
  fsmHint?: ChatbotState | string | null;
  intent?: ChatbotAgentIntent;
  actions?: ChatbotAgentAction[];
  handoff?: boolean;
}

export const CHATBOT_AGENT_ACTION_TYPES: ChatbotAgentActionType[] = [
  "suggest_doctor",
  "rerank_doctor",
  "show_slots",
  "set_branch",
  "set_patient_name",
  "parse_datetime",
  "book_appointment",
  "cancel_appointment",
  "reschedule_appointment",
  "handoff_operator",
];

export function isChatbotAgentMode(): boolean {
  const v = process.env["CHATBOT_AGENT_MODE"]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Playground always uses agent mode; WhatsApp requires CHATBOT_AGENT_MODE=1. */
export function shouldUseAgentTurn(channel: "playground" | "whatsapp"): boolean {
  if (channel === "playground") return true;
  return isChatbotAgentMode();
}
