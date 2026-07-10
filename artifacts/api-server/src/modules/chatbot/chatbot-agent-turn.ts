import { createChatCompletion, CHAT_MODEL } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import type { ChatbotSettings } from "@workspace/db";
import type { ChatbotState, ChatbotSessionData } from "./chatbot.types";
import type { ChatMessage } from "./ai-classifier";
import { mergeReply, appendToReply, replyFromText, joinChatbotReply, conciseReply } from "./ai-classifier";
import type { ChatbotReply } from "./chatbot-reply";
import { replyFromAgentText } from "./chatbot-reply-enrich";
import { buildKnowledgeAgentPrompt } from "./chatbot-knowledge-agent-prompt";
import { parseChatbotAgentTurn } from "./chatbot-agent-parser";
import {
  executeChatbotAgentTools,
  deriveFsmStateFromAgent,
  buildDoctorPresentationFallback,
} from "./chatbot-tools";
import type { DoctorCandidate } from "../analytics/analytics.repository";

type OutboundResponse = ChatbotReply | null;

function finalizeAgentReply(
  agentReply: ChatbotReply,
  toolResult: { suggestedDoctor?: DoctorCandidate | null; slotsAppendix?: string },
  urgency?: string,
): ChatbotReply {
  let reply = conciseReply(agentReply);

  if (reply.parts.length === 0) {
    reply = replyFromText("Подскажите, чем могу помочь?");
  }

  if (toolResult.suggestedDoctor && !joinChatbotReply(reply).includes(toolResult.suggestedDoctor.name)) {
    reply = appendToReply(reply, buildDoctorPresentationFallback(toolResult.suggestedDoctor, urgency));
  }

  if (toolResult.slotsAppendix) {
    reply = appendToReply(reply, toolResult.slotsAppendix);
  }

  if (toolResult.suggestedDoctor && /администратор/i.test(joinChatbotReply(reply))) {
    reply = appendToReply(
      replyFromText("Подобрали врача для вашей записи."),
      buildDoctorPresentationFallback(toolResult.suggestedDoctor, urgency),
    );
  }

  return conciseReply(reply);
}

function buildKnowledgeFallbackReply(data: ChatbotSessionData): string {
  if (data.createdProcedureId) return "Ваша запись уже оформлена. Если нужно изменить время — напишите.";
  if (data.preferredDatetime && data.suggestedDoctorName) {
    return `Записываем к ${data.suggestedDoctorName} на ${data.preferredDatetime}. Подтвердите, пожалуйста.`;
  }
  if (data.suggestedDoctorName && !data.preferredDatetime) {
    return `Подобрали ${data.suggestedDoctorName}. Когда вам удобно прийти?`;
  }
  if (data.selectedBranch && !data.suggestedDoctorName) {
    return `Отлично, филиал «${data.selectedBranch}». Подскажите, с чем обращаетесь?`;
  }
  return "Подскажите, чем могу помочь?";
}

export interface AgentTurnDeps {
  clinicId: string;
  phone: string;
  messageText: string;
  dryRun: boolean;
  settings: ChatbotSettings;
  clinicName: string;
  composedSystemPrompt: string;
  knowledgeContext: string;
  clinicBranchNames: string[];
  calendarConfig: ChatbotSettings["calendarConfig"];
  recentMessages: ChatMessage[];
  sessionState: ChatbotState;
  sessionData: ChatbotSessionData;
  noteAction: (msg: string) => void;
  finalizeBooking?: (params: {
    data: ChatbotSessionData;
    branchToSave: string;
    promptState?: ChatbotState;
  }) => Promise<{ data: ChatbotSessionData; response: OutboundResponse }>;
}

export interface AgentTurnOutcome {
  state: ChatbotState;
  data: ChatbotSessionData;
  response: OutboundResponse;
  humanTakeover: boolean;
}

/** Run one knowledge-guided agent turn (Gemini dialogue + server tools). */
export async function runChatbotAgentTurn(deps: AgentTurnDeps): Promise<AgentTurnOutcome> {
  const {
    clinicId,
    phone,
    messageText,
    dryRun,
    clinicName,
    composedSystemPrompt,
    knowledgeContext,
    clinicBranchNames,
    calendarConfig,
    recentMessages,
    noteAction,
    finalizeBooking,
  } = deps;

  let data = { ...deps.sessionData };
  let state = deps.sessionState;

  const systemPrompt = buildKnowledgeAgentPrompt({
    composedBasePrompt: composedSystemPrompt,
    clinicName,
    channel: dryRun ? "playground" : "whatsapp",
    phone,
    sessionData: data,
  });

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...recentMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: messageText },
  ];

  let agentTurn = null;

  try {
    const completion = await createChatCompletion(
      {
        model: CHAT_MODEL,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.35,
        max_tokens: 560,
      },
      {
        timeoutMs: 28_000,
        label: dryRun ? "chatbotAgentTurnPlayground" : "chatbotAgentTurn",
      },
    );
    const raw = completion.choices[0]?.message?.content ?? null;
    agentTurn = parseChatbotAgentTurn(raw);
    if (!agentTurn) {
      logger.warn({ rawSnippet: raw?.slice(0, 300) }, "[AgentTurn] Invalid agent JSON");
    }
  } catch (err) {
    logger.error({ err }, "[AgentTurn] LLM call failed");
  }

  if (!agentTurn) {
    const toolResult = await executeChatbotAgentTools(data, [], undefined, {
      clinicId,
      phone,
      messageText,
      dryRun,
      calendarConfig,
      knowledgeContext,
      officialBranches: clinicBranchNames,
      noteAction,
    });
    data = toolResult.data;
    state = deriveFsmStateFromAgent(data, state);
    const reply = finalizeAgentReply(replyFromText(buildKnowledgeFallbackReply(data)), toolResult, data.urgency);
    if (dryRun) {
      for (const note of toolResult.toolNotes) noteAction(note);
      noteAction("Fallback: JSON недоступен");
    }
    return { state, data, response: reply, humanTakeover: false };
  }

  if (agentTurn.handoff) {
    return {
      state: "human_takeover",
      data,
      response: replyFromText(
        "Соединяю вас с администратором. Пожалуйста, ожидайте — вам ответят в ближайшее время.",
      ),
      humanTakeover: true,
    };
  }

  const toolResult = await executeChatbotAgentTools(
    data,
    agentTurn.actions ?? [],
    agentTurn.intent,
    {
      clinicId,
      phone,
      messageText,
      dryRun,
      calendarConfig,
      knowledgeContext,
      officialBranches: clinicBranchNames,
      noteAction,
    },
  );

  data = toolResult.data;
  state = deriveFsmStateFromAgent(data, agentTurn.fsmHint);

  if (toolResult.handoff) {
    return {
      state: "human_takeover",
      data,
      response: mergeReply(
        replyFromText(agentTurn.reply),
        "К сожалению, сейчас нет доступных врачей. Напишите «оператор», чтобы связаться с администратором.",
      ),
      humanTakeover: true,
    };
  }

  if (toolResult.bookingReady && finalizeBooking && data.selectedBranch) {
    try {
      const finalized = await finalizeBooking({
        data,
        branchToSave: data.selectedBranch,
        promptState: "confirm_appointment",
      });
      return {
        state: "done",
        data: finalized.data,
        response: finalized.response ?? replyFromText(agentTurn.reply),
        humanTakeover: false,
      };
    } catch (err) {
      logger.error({ err }, "[AgentTurn] finalizeBooking failed");
      noteAction("Ошибка создания записи");
    }
  }

  const reply = finalizeAgentReply(
    replyFromAgentText(agentTurn.reply, agentTurn.replyParts),
    toolResult,
    data.urgency,
  );

  if (toolResult.toolNotes.length > 0 && dryRun) {
    for (const note of toolResult.toolNotes) {
      noteAction(note);
    }
  }

  return {
    state,
    data,
    response: reply,
    humanTakeover: false,
  };
}
