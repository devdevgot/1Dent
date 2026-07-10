import { createChatCompletion, CHAT_MODEL, FAST_MODEL } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import type { ChatbotSettings } from "@workspace/db";
import type { ChatbotState, ChatbotSessionData } from "./chatbot.types";
import type { ChatMessage, ManagerExample } from "./ai-classifier";
import { mergeReply, appendToReply, replyFromText } from "./ai-classifier";
import type { ChatbotReply } from "./chatbot-reply";
import { buildAgentOrchestratorPrompt } from "./chatbot-agent-prompt";
import { parseChatbotAgentTurn } from "./chatbot-agent-parser";
import { buildScriptContextForAgent, assertAllowedTransition } from "./chatbot-agent-context";
import {
  executeChatbotAgentTools,
  deriveFsmStateFromAgent,
  buildDoctorPresentationFallback,
} from "./chatbot-tools";
import type { ScriptMindMapData } from "./mindmap-utils";
import { findMindMapNodeByFsmState } from "./mindmap-utils";
import {
  filterFactsForState,
  type ChatbotPromptFacts,
} from "./chatbot-prompt-builder";
import {
  buildAgentFallbackReply,
  inferAgentActionsForTransition,
  resolveDeterministicNextNodeId,
} from "./chatbot-agent-orchestrator";

type OutboundResponse = ChatbotReply | null;

export interface AgentTurnDeps {
  clinicId: string;
  phone: string;
  messageText: string;
  dryRun: boolean;
  settings: ChatbotSettings;
  mindMap: ScriptMindMapData;
  clinicName: string;
  knowledgeContext: string;
  priceListContext: string;
  clinicBranchNames: string[];
  calendarConfig: ChatbotSettings["calendarConfig"];
  recentMessages: ChatMessage[];
  managerExamples: ManagerExample[];
  sessionState: ChatbotState;
  sessionData: ChatbotSessionData;
  noteAction: (msg: string) => void;
  buildPromptFacts: (fsmState: ChatbotState) => ChatbotPromptFacts;
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

function buildSessionSummary(data: ChatbotSessionData): string {
  const parts: string[] = [];
  if (data.patientName) parts.push(`Имя: ${data.patientName}`);
  if (data.serviceType) parts.push(`Услуга: ${data.serviceType}`);
  if (data.urgency) parts.push(`Срочность: ${data.urgency}`);
  if (data.selectedBranch) parts.push(`Филиал: ${data.selectedBranch}`);
  if (data.suggestedDoctorName) parts.push(`Врач: ${data.suggestedDoctorName}`);
  if (data.preferredDatetime) parts.push(`Время: ${data.preferredDatetime}`);
  if (data.activeMindMapNodeId) parts.push(`Узел скрипта: ${data.activeMindMapNodeId}`);
  return parts.join(". ");
}

/** Run one script-guided agent turn (model orchestrates dialogue + tools). */
export async function runChatbotAgentTurn(deps: AgentTurnDeps): Promise<AgentTurnOutcome> {
  const {
    clinicId,
    phone,
    messageText,
    dryRun,
    mindMap,
    clinicName,
    knowledgeContext,
    clinicBranchNames,
    calendarConfig,
    recentMessages,
    noteAction,
    buildPromptFacts,
    finalizeBooking,
  } = deps;

  let data = { ...deps.sessionData };
  let state = deps.sessionState;

  const scriptCtx = buildScriptContextForAgent(mindMap, data.activeMindMapNodeId);
  const safeMindMap = mindMap?.nodes?.length ? mindMap : null;

  const fsmForFacts = (scriptCtx.currentFsmState as ChatbotState) ?? state;
  const facts = buildPromptFacts(fsmForFacts);

  const systemPrompt = buildAgentOrchestratorPrompt({
    clinicName,
    channel: dryRun ? "playground" : "whatsapp",
    script: scriptCtx,
    facts: filterFactsForState(facts, fsmForFacts),
    fsmState: fsmForFacts,
    sessionSummary: buildSessionSummary(data),
  });

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...recentMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: messageText },
  ];

  const llmModel = dryRun ? FAST_MODEL : CHAT_MODEL;
  const llmTimeoutMs = dryRun ? 20_000 : 35_000;

  let agentTurn = null;
  let usedParseFallback = false;
  try {
    const completion = await createChatCompletion(
      {
        model: llmModel,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.55,
        max_tokens: dryRun ? 768 : 1024,
      },
      { timeoutMs: llmTimeoutMs, label: dryRun ? "chatbotAgentTurnPlayground" : "chatbotAgentTurn" },
    );
    const raw = completion.choices[0]?.message?.content ?? null;
    agentTurn = parseChatbotAgentTurn(raw);
    if (!agentTurn) {
      logger.warn({ rawSnippet: raw?.slice(0, 300) }, "[AgentTurn] Invalid agent JSON — using node fallback");
      usedParseFallback = true;
    }
  } catch (err) {
    logger.error({ err }, "[AgentTurn] LLM call failed");
    usedParseFallback = true;
  }

  const fromNodeId = scriptCtx.currentNodeId;
  const fromNode = safeMindMap?.nodes.find((n) => n.id === fromNodeId);

  const toNodeId = resolveDeterministicNextNodeId(
    safeMindMap,
    fromNodeId,
    messageText,
    data,
    agentTurn?.mindMapNodeId,
    clinicBranchNames,
  );
  const toNode = safeMindMap?.nodes.find((n) => n.id === toNodeId);

  if (!agentTurn) {
    const fallbackReply = buildAgentFallbackReply({
      scriptCtx,
      fsmState: fsmForFacts,
      sessionData: data,
      clinicBranchNames,
      knowledgeContext: deps.knowledgeContext,
    });
    const actions = inferAgentActionsForTransition(
      fromNode,
      toNode,
      data,
      messageText,
      clinicBranchNames,
      [],
    );

    if (toNodeId) data.activeMindMapNodeId = toNodeId;
    if (toNode?.fsmState) state = toNode.fsmState as ChatbotState;

    const toolResult = await executeChatbotAgentTools(data, actions, undefined, {
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
    state = deriveFsmStateFromAgent(data, toNode?.fsmState, toNode?.fsmState);

    let reply = replyFromText(fallbackReply);
    if (toolResult.suggestedDoctor) {
      reply = mergeReply(reply, buildDoctorPresentationFallback(toolResult.suggestedDoctor, data.urgency));
    }
    if (toolResult.slotsAppendix) {
      reply = appendToReply(reply, toolResult.slotsAppendix);
    }
    if (dryRun) {
      noteAction(usedParseFallback ? "Agent JSON fallback — node-aware reply" : "Agent orchestrator fallback");
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

  const fromNodeIdResolved = fromNodeId;
  let resolvedToNodeId = toNodeId;
  const transition = assertAllowedTransition(safeMindMap, fromNodeIdResolved, resolvedToNodeId ?? undefined);
  if (!transition.allowed) {
    logger.warn(
      { reason: transition.reason, fromNodeId: fromNodeIdResolved, toNodeId: resolvedToNodeId },
      "[AgentTurn] Blocked transition — staying on node",
    );
    resolvedToNodeId = fromNodeIdResolved;
  }

  if (resolvedToNodeId) {
    data.activeMindMapNodeId = resolvedToNodeId;
    const targetNode = safeMindMap?.nodes.find((n) => n.id === resolvedToNodeId);
    if (targetNode?.fsmState) {
      state = targetNode.fsmState as ChatbotState;
    }
  }

  const mergedActions = inferAgentActionsForTransition(
    fromNode,
    safeMindMap?.nodes.find((n) => n.id === resolvedToNodeId),
    data,
    messageText,
    clinicBranchNames,
    agentTurn.actions ?? [],
  );

  const toolResult = await executeChatbotAgentTools(
    data,
    mergedActions,
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
  state = deriveFsmStateFromAgent(
    data,
    agentTurn.fsmHint,
    safeMindMap?.nodes.find((n) => n.id === resolvedToNodeId)?.fsmState,
  );

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

  let reply = replyFromText(agentTurn.reply);

  if (toolResult.suggestedDoctor && !agentTurn.reply.includes(toolResult.suggestedDoctor.name)) {
    reply = mergeReply(
      reply,
      buildDoctorPresentationFallback(toolResult.suggestedDoctor, data.urgency),
    );
  }

  if (toolResult.slotsAppendix) {
    reply = appendToReply(reply, toolResult.slotsAppendix);
  }

  if (toolResult.toolNotes.length > 0 && dryRun) {
    noteAction(`Tools: ${toolResult.toolNotes.join("; ")}`);
  }

  if (!data.activeMindMapNodeId && state) {
    const byFsm = findMindMapNodeByFsmState(safeMindMap, state);
    if (byFsm) data.activeMindMapNodeId = byFsm.id;
  }

  return {
    state,
    data,
    response: reply,
    humanTakeover: false,
  };
}
