import type { ChatbotSessionData, ChatbotState } from "./chatbot.types";
import type { ChatbotAgentAction } from "./chatbot-agent.types";
import type { AgentScriptContext } from "./chatbot-agent-context.ts";
import { isPromoOrFillerText, stripPromoFromText } from "./chatbot-reply-format.ts";
import {
  buildBranchPromptFallback,
  buildSymptomsPromptFallback,
  branchChoiceResolved,
  hasClinicKnowledge,
  isBranchListInquiry,
  isBranchSelectionNode,
  isPatientInquiry,
  resolveBranchStepClarificationReply,
  resolveOfficialBranchFromMessage,
} from "./clinic-knowledge.ts";
import {
  buildDecisionFallback,
  isHesitating,
  isReadyToBook,
  isRefusing,
  isShortYes,
} from "./booking-script.ts";
import {
  getMindMapOutgoingEdges,
  matchMindMapBranch,
  resolveMindMapNodeIdForState,
  type ScriptMindMapData,
  type ScriptMindMapNode,
} from "./mindmap-utils.ts";

/** Pick next mind-map node algorithmically; LLM suggestion is a hint only. */
export function resolveDeterministicNextNodeId(
  mindMap: ScriptMindMapData | null | undefined,
  fromNodeId: string,
  messageText: string,
  sessionData: ChatbotSessionData,
  llmSuggestedId?: string | null,
  officialBranches: string[] = [],
): string {
  if (!mindMap?.nodes?.length) return fromNodeId;

  const fromNode = mindMap.nodes.find((n) => n.id === fromNodeId);
  if (!fromNode) return fromNodeId;

  const outgoing = getMindMapOutgoingEdges(mindMap, fromNodeId);
  const trimmed = messageText.trim();

  if (isBranchSelectionNode(fromNode.id, fromNode.fsmState)) {
    if (!branchChoiceResolved(trimmed, sessionData.selectedBranch, officialBranches)) {
      return fromNodeId;
    }
  }

  if (
    isPatientInquiry(trimmed) &&
    fromNode.fsmState !== "await_decision" &&
    !branchChoiceResolved(trimmed, sessionData.selectedBranch, officialBranches)
  ) {
    return fromNodeId;
  }

  if (fromNode.fsmState === "await_decision" && outgoing.length >= 2) {
    if (isRefusing(trimmed)) {
      const target = outgoing.find(
        (o) => o.target.fsmState === "done" || /нет|отказ/i.test(o.edge.label ?? ""),
      );
      if (target) return target.target.id;
    }
    if (isHesitating(trimmed)) {
      const target = outgoing.find(
        (o) =>
          o.target.fsmState === "handle_objections" || /подум/i.test(o.edge.label ?? ""),
      );
      if (target) return target.target.id;
    }
    if (isReadyToBook(trimmed)) {
      const target = outgoing.find(
        (o) =>
          o.target.fsmState === "collect_datetime" || /да|готов|запис/i.test(o.edge.label ?? ""),
      );
      if (target) return target.target.id;
    }
  }

  const branch = matchMindMapBranch(mindMap, fromNodeId, {
    serviceType: sessionData.serviceType,
    userText: trimmed,
  });
  if (branch) return branch.node.id;

  if (
    (fromNode.fsmState === "collect_qualification" || fromNode.id === "step2-qualification") &&
    trimmed.length >= 3 &&
    !isPatientInquiry(trimmed)
  ) {
    const branchStep = outgoing.find(
      (o) => o.target.id === "step2-branch" || isBranchSelectionNode(o.target.id, o.target.fsmState),
    );
    if (branchStep) return branchStep.target.id;
  }

  if (fromNode.fsmState === "collect_problem" && trimmed.length >= 2) {
    const qual = outgoing.find((o) => o.target.fsmState === "collect_qualification");
    if (qual) return qual.target.id;
  }

  if (
    (fromNode.fsmState === "collect_qualification" || fromNode.id === "step2-branch") &&
    branchChoiceResolved(trimmed, sessionData.selectedBranch, officialBranches)
  ) {
    const nextId = resolveMindMapNodeIdForState(mindMap, "suggest_doctor", {
      activeNodeId: fromNodeId,
      serviceType: sessionData.serviceType,
    });
    if (nextId && nextId !== fromNodeId) return nextId;
  }

  if (fromNode.fsmState === "suggest_doctor" && sessionData.suggestedDoctorId && trimmed.length >= 2) {
    const nextId = resolveMindMapNodeIdForState(mindMap, "await_decision", {
      activeNodeId: fromNodeId,
    });
    if (nextId && nextId !== fromNodeId) return nextId;
  }

  if (isBranchSelectionNode(fromNode.id, fromNode.fsmState) && outgoing.length === 1) {
    return outgoing[0]!.target.id;
  }

  if (outgoing.length === 1) {
    if (isPatientInquiry(trimmed)) {
      return fromNodeId;
    }
    if (trimmed.length >= 2) {
      return outgoing[0]!.target.id;
    }
  }

  if (llmSuggestedId && llmSuggestedId !== fromNodeId && isDirectTransition(mindMap, fromNodeId, llmSuggestedId)) {
    if (isPatientInquiry(trimmed) && !branchChoiceResolved(trimmed, sessionData.selectedBranch, officialBranches)) {
      return fromNodeId;
    }
    if (
      isBranchSelectionNode(fromNode.id, fromNode.fsmState) &&
      !branchChoiceResolved(trimmed, sessionData.selectedBranch, officialBranches)
    ) {
      return fromNodeId;
    }
    return llmSuggestedId;
  }

  return fromNodeId;
}

function isDirectTransition(
  mindMap: ScriptMindMapData,
  fromNodeId: string,
  toNodeId: string,
): boolean {
  if (!mindMap.nodes.some((n) => n.id === toNodeId)) return false;
  const outgoing = getMindMapOutgoingEdges(mindMap, fromNodeId);
  if (outgoing.length === 0) return true;
  return outgoing.some((o) => o.target.id === toNodeId);
}

/** Context-aware fallback — never resets to generic greeting mid-flow. */
export function buildAgentFallbackReply(opts: {
  scriptCtx: AgentScriptContext;
  fsmState: ChatbotState;
  sessionData: ChatbotSessionData;
  clinicBranchNames: string[];
  knowledgeContext: string;
  messageText?: string;
  targetNodeId?: string;
  targetFsmState?: ChatbotState;
}): string {
  const {
    scriptCtx,
    fsmState,
    sessionData,
    clinicBranchNames,
    knowledgeContext,
    messageText,
    targetNodeId,
    targetFsmState,
  } = opts;
  const hasKnowledge = hasClinicKnowledge(knowledgeContext);
  const effectiveFsm = targetFsmState ?? fsmState;
  const effectiveNodeId = targetNodeId ?? scriptCtx.currentNodeId;
  const trimmedMessage = messageText?.trim() ?? "";
  const qualificationDone =
    trimmedMessage.length >= 2 &&
    !isPatientInquiry(trimmedMessage) &&
    (effectiveNodeId === "step2-branch" ||
      effectiveFsm === "suggest_doctor" ||
      (effectiveFsm === "collect_qualification" && scriptCtx.currentNodeId === "step2-qualification"));

  if (
    isBranchSelectionNode(effectiveNodeId, effectiveFsm) ||
    effectiveNodeId === "step2-branch" ||
    (messageText && isBranchListInquiry(messageText))
  ) {
    return resolveBranchStepClarificationReply({
      messageText: messageText ?? "",
      selectedBranch: sessionData.selectedBranch,
      clinicBranchNames,
      knowledgeContext,
    });
  }

  if (qualificationDone) {
    if (!sessionData.selectedBranch && clinicBranchNames.length > 1) {
      return buildBranchPromptFallback(hasKnowledge, clinicBranchNames);
    }
    if (!sessionData.selectedBranch && clinicBranchNames.length === 1) {
      return `Запишем вас в филиал «${clinicBranchNames[0]}»?`;
    }
    if (sessionData.suggestedDoctorName) {
      return `Подходит ${sessionData.suggestedDoctorName}? (Да / другой врач)`;
    }
    return "Подберём врача — подскажите удобное время для визита?";
  }

  switch (effectiveFsm) {
    case "greeting":
    case "collect_problem":
      return "Подскажите, какая услуга вас интересует?";
    case "collect_qualification":
      if (scriptCtx.currentNodeId === "step2-qualification") {
        return buildSymptomsPromptFallback();
      }
      if (!sessionData.selectedBranch && clinicBranchNames.length > 1) {
        return buildBranchPromptFallback(hasKnowledge, clinicBranchNames);
      }
      return buildSymptomsPromptFallback();
    case "collect_branch":
      return buildBranchPromptFallback(hasKnowledge, clinicBranchNames);
    case "suggest_doctor":
      return sessionData.suggestedDoctorName
        ? `Подходит вам ${sessionData.suggestedDoctorName} или подобрать другого врача?`
        : "Подберём врача под ваш запрос — расскажите, что беспокоит?";
    case "await_decision":
      return buildDecisionFallback();
    case "collect_datetime":
      return "Какая дата и время вам удобны для визита?";
    case "handle_objections":
      return "Что именно смущает — цена, страх процедуры или нужно больше информации?";
    case "confirm_appointment":
      return "Подтверждаем запись? Если всё верно — напишите «да».";
    default:
      return scriptCtx.currentNodeLabel
        ? `Продолжим запись. Расскажите подробнее?`
        : "Расскажите подробнее, пожалуйста.";
  }
}

function shortenNodePrompt(content: string): string {
  const cleaned = stripPromoFromText(content);
  if (cleaned && !isPromoOrFillerText(cleaned)) {
    const first = cleaned.split(/(?<=[.!?])\s+/)[0]?.trim() ?? cleaned;
    const clipped = first.slice(0, 160).trim();
    if (clipped) return clipped.endsWith("?") ? clipped : `${clipped.replace(/[.!]$/, "")}?`;
  }
  return "Расскажите подробнее, пожалуйста?";
}

/** Server-side tools when the algorithm advances the node (LLM may omit actions). */
export function inferAgentActionsForTransition(
  fromNode: ScriptMindMapNode | undefined,
  toNode: ScriptMindMapNode | undefined,
  sessionData: ChatbotSessionData,
  messageText: string,
  officialBranches: string[],
  existingActions: ChatbotAgentAction[],
): ChatbotAgentAction[] {
  const actions = [...existingActions];
  const has = (type: ChatbotAgentAction["type"]) => actions.some((a) => a.type === type);

  if (toNode?.fsmState === "suggest_doctor" && !sessionData.suggestedDoctorId && !has("suggest_doctor")) {
    actions.push({ type: "suggest_doctor" });
  }

  if (
    (toNode?.id === "step2-doctor" || toNode?.fsmState === "suggest_doctor") &&
    !sessionData.suggestedDoctorId &&
    !has("suggest_doctor")
  ) {
    actions.push({ type: "suggest_doctor" });
  }

  const patientConfirmed =
    isShortYes(messageText) || isReadyToBook(messageText) || branchChoiceResolved(messageText, sessionData.selectedBranch, officialBranches);

  if (
    sessionData.selectedBranch &&
    !sessionData.suggestedDoctorId &&
    !has("suggest_doctor") &&
    patientConfirmed
  ) {
    actions.push({ type: "suggest_doctor" });
  }

  if (
    sessionData.suggestedDoctorId &&
    patientConfirmed &&
    (fromNode?.fsmState === "suggest_doctor" ||
      fromNode?.fsmState === "await_decision" ||
      toNode?.fsmState === "collect_datetime") &&
    !has("show_slots")
  ) {
    actions.push({ type: "show_slots" });
  }

  if (
    (toNode?.fsmState === "collect_datetime" || toNode?.id === "step4-booking") &&
    sessionData.suggestedDoctorId &&
    !has("show_slots")
  ) {
    actions.push({ type: "show_slots" });
  }

  if (
    (fromNode?.fsmState === "collect_qualification" || fromNode?.id === "step2-branch") &&
    !sessionData.selectedBranch &&
    officialBranches.length > 0
  ) {
    const matchedBranch = resolveOfficialBranchFromMessage(messageText, officialBranches);
    if (matchedBranch && !has("set_branch")) {
      actions.push({ type: "set_branch", branch: matchedBranch });
      if (!sessionData.suggestedDoctorId && !has("suggest_doctor")) {
        actions.push({ type: "suggest_doctor" });
      }
    }
  }

  if (toNode?.fsmState === "collect_datetime" && !sessionData.preferredDatetime && !has("parse_datetime")) {
    actions.push({ type: "parse_datetime", datetimeText: messageText });
  }

  return actions;
}
