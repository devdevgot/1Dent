import type { ChatMessage, ChatbotReply } from "./ai-classifier";
import type { PlaygroundScenario, PlaygroundSessionInput } from "./playground-scenarios";
import type { ChatbotSessionData, ChatbotState } from "./chatbot.types";

export interface ProcessMessageOptions {
  skipRedAlert?: boolean;
  dryRun?: boolean;
  sessionInput?: PlaygroundSessionInput;
  historyInput?: ChatMessage[];
  scenario?: PlaygroundScenario;
  /** Start dialog with bot greeting (no user message required) */
  initGreeting?: boolean;
  /** Playground: simulate with real patient phone/session/history from DB */
  useRealSession?: boolean;
  realPatientPhone?: string;
}

export interface TurnResult {
  outbound: ChatbotReply | null;
  session: {
    id: string;
    clinicId: string;
    phone: string;
    state: ChatbotState;
    data: ChatbotSessionData;
    humanTakeover: boolean;
  };
  simulatedActions: string[];
}

export interface SimulateMessageResult {
  reply: string;
  parts: string[];
  pausesMs: number[];
  fsmState: ChatbotState;
  humanTakeover: boolean;
  sessionData: ChatbotSessionData;
  mindMapNode: { id: string; label: string; fsmState?: string } | null;
  simulatedActions: string[];
}
