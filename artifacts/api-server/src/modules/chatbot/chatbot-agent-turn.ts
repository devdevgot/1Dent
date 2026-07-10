import { createChatCompletion, CHAT_MODEL, FAST_MODEL } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import type { ChatbotSettings } from "@workspace/db";
import type { ChatbotState, ChatbotSessionData } from "./chatbot.types";
import type { ChatMessage } from "./ai-classifier";
import { mergeReply, appendToReply, replyFromText, joinChatbotReply, conciseReply, generateChatbotResponse } from "./ai-classifier";
import type { ChatbotReply } from "./chatbot-reply";
import { replyFromAgentText, enrichReplyWithFsmFollowUp } from "./chatbot-reply-enrich";
import { buildKnowledgeAgentPrompt } from "./chatbot-knowledge-agent-prompt";
import { parseChatbotAgentTurn } from "./chatbot-agent-parser";
import {
  executeChatbotAgentTools,
  deriveFsmStateFromAgent,
  buildDoctorPresentationFallback,
} from "./chatbot-tools";
import type { DoctorCandidate } from "../analytics/analytics.repository";

type OutboundResponse = ChatbotReply | null;

type AgentLlmMessage = { role: "system" | "user" | "assistant"; content: string };

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

async function fetchAgentLlmRaw(messages: AgentLlmMessage[], dryRun: boolean): Promise<string | null> {
  const label = dryRun ? "chatbotAgentTurnPlayground" : "chatbotAgentTurn";
  const attempts: Array<{
    model: string;
    jsonMode: boolean;
    disableReasoning?: boolean;
    timeoutMs: number;
    attemptLabel: string;
  }> = [
    { model: CHAT_MODEL, jsonMode: true, timeoutMs: 28_000, attemptLabel: label },
    { model: CHAT_MODEL, jsonMode: false, timeoutMs: 28_000, attemptLabel: `${label}Plain` },
    { model: FAST_MODEL, jsonMode: true, disableReasoning: true, timeoutMs: 20_000, attemptLabel: `${label}FastJson` },
  ];

  for (const attempt of attempts) {
    try {
      const completion = await createChatCompletion(
        {
          model: attempt.model,
          messages,
          ...(attempt.jsonMode ? { response_format: { type: "json_object" } } : {}),
          temperature: attempt.jsonMode ? 0.35 : 0.4,
          max_tokens: 720,
        },
        {
          timeoutMs: attempt.timeoutMs,
          label: attempt.attemptLabel,
          disableReasoning: attempt.disableReasoning,
        },
      );
      const raw = completion.choices[0]?.message?.content?.trim() ?? null;
      if (raw) return raw;
      logger.warn({ label: attempt.attemptLabel }, "[AgentTurn] Empty LLM content — next attempt");
    } catch (err) {
      logger.warn({ err, label: attempt.attemptLabel }, "[AgentTurn] LLM attempt failed");
    }
  }

  return null;
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

  const messages: AgentLlmMessage[] = [
    { role: "system", content: systemPrompt },
    ...recentMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: messageText },
  ];

  const raw = await fetchAgentLlmRaw(messages, dryRun);
  let agentTurn = raw ? parseChatbotAgentTurn(raw) : null;

  if (!agentTurn) {
    logger.warn(
      { dryRun, rawSnippet: raw?.slice(0, 200) ?? null },
      "[AgentTurn] Structured JSON unavailable — using plain-text fallback",
    );

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

    const plainPrompt = [
      composedSystemPrompt,
      "",
      "Отвечай как живой менеджер в WhatsApp.",
      "Коротко, 1–3 сообщения. Разделяй смысл абзацами — каждый абзац отдельное сообщение.",
      "Не используй JSON и не упоминай технические ошибки.",
    ].join("\n");

    const recoveredTurn = raw ? parseChatbotAgentTurn(raw) : null;
    const aiReply = await generateChatbotResponse(plainPrompt, recentMessages, messageText);
    const baseReply =
      aiReply?.parts.length
        ? aiReply
        : recoveredTurn
          ? replyFromAgentText(recoveredTurn.reply, recoveredTurn.replyParts)
          : replyFromText(buildKnowledgeFallbackReply(data));

    const reply = finalizeAgentReply(
      enrichReplyWithFsmFollowUp(baseReply, {
        fsmState: state,
        sessionData: data,
        clinicBranchNames,
        messageText,
      }),
      toolResult,
      data.urgency,
    );

    if (dryRun) {
      for (const note of toolResult.toolNotes) noteAction(note);
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
    enrichReplyWithFsmFollowUp(
      replyFromAgentText(agentTurn.reply, agentTurn.replyParts),
      {
        fsmState: state,
        sessionData: data,
        clinicBranchNames,
        messageText,
      },
    ),
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
