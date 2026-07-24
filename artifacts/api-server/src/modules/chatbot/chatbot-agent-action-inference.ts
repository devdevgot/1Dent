import type { ChatbotSessionData } from "./chatbot.types";
import type { ChatbotAgentAction, ChatbotAgentActionType } from "./chatbot-agent.types";
import { tryParseAppointmentDatetimeLocal } from "./almaty-time";
import { resolveOfficialBranchFromMessage } from "./clinic-knowledge";
import { isReadyToBook, isShortYes } from "./booking-script";
import { hasPatientIdentity } from "./chatbot-patient-identity";

/** Stable execution order so book_appointment runs after data-collecting actions. */
export const ACTION_ORDER: ChatbotAgentActionType[] = [
  "set_branch",
  "set_patient_name",
  "suggest_doctor",
  "rerank_doctor",
  "parse_datetime",
  "show_slots",
  "book_appointment",
  "cancel_appointment",
  "reschedule_appointment",
  "handoff_operator",
];

export function orderAgentActions(actions: ChatbotAgentAction[]): ChatbotAgentAction[] {
  const rank = new Map(ACTION_ORDER.map((t, i) => [t, i]));
  return [...actions].sort((a, b) => (rank.get(a.type) ?? 99) - (rank.get(b.type) ?? 99));
}

function messageLikelyIsName(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  if (isShortYes(trimmed) || isReadyToBook(trimmed)) return false;
  if (/\d{5,}/.test(trimmed)) return false;
  return /^[\p{L}\s'.-]+$/u.test(trimmed);
}

function messageLikelyContainsDatetime(text: string): boolean {
  if (tryParseAppointmentDatetimeLocal(text)) return true;
  return /завтра|послезавтра|сегодня|через\s+\d+\s*(час|день)|в\s*\d{1,2}[:.]\d{2}|\d{1,2}:\d{2}|понедельник|вторник|сред|четверг|пятниц|суббот|воскресен/i.test(
    text,
  );
}

/** Server-side action inference when the LLM omits tools (e.g. datetime without parse_datetime). */
export function inferKnowledgeAgentActions(
  sessionData: ChatbotSessionData,
  messageText: string,
  officialBranches: string[],
  existingActions: ChatbotAgentAction[],
): ChatbotAgentAction[] {
  const actions = [...existingActions];
  const has = (type: ChatbotAgentAction["type"]) => actions.some((a) => a.type === type);

  if (!sessionData.selectedBranch && officialBranches.length === 1 && !has("set_branch")) {
    actions.push({ type: "set_branch", branch: officialBranches[0]! });
  }

  const matchedBranch = resolveOfficialBranchFromMessage(messageText, officialBranches);
  if (matchedBranch && !sessionData.selectedBranch && !has("set_branch")) {
    actions.push({ type: "set_branch", branch: matchedBranch });
  }

  const patientConfirmed =
    isShortYes(messageText) || isReadyToBook(messageText) || Boolean(matchedBranch);

  if (
    (sessionData.selectedBranch || officialBranches.length === 1 || has("set_branch")) &&
    !sessionData.suggestedDoctorId &&
    !has("suggest_doctor") &&
    (sessionData.serviceType || sessionData.problemDescription || patientConfirmed)
  ) {
    actions.push({ type: "suggest_doctor" });
  }

  if (
    (sessionData.suggestedDoctorId || has("suggest_doctor")) &&
    messageLikelyContainsDatetime(messageText) &&
    !has("parse_datetime")
  ) {
    actions.push({ type: "parse_datetime", datetimeText: messageText });
  }

  if (
    !hasPatientIdentity(sessionData) &&
    messageLikelyIsName(messageText) &&
    !has("set_patient_name")
  ) {
    actions.push({ type: "set_patient_name", name: messageText.trim() });
  }

  // Prerequisites may be filled by other actions in this same turn.
  const branchReadyThisTurn =
    Boolean(sessionData.selectedBranch) || has("set_branch") || officialBranches.length === 1;
  const doctorReadyThisTurn = Boolean(sessionData.suggestedDoctorId) || has("suggest_doctor");
  const datetimeReadyThisTurn =
    Boolean(sessionData.preferredDatetime) || has("parse_datetime");
  const nameReadyThisTurn = hasPatientIdentity(sessionData) || has("set_patient_name");

  if (
    doctorReadyThisTurn &&
    datetimeReadyThisTurn &&
    branchReadyThisTurn &&
    nameReadyThisTurn &&
    (isShortYes(messageText) || isReadyToBook(messageText) || patientConfirmed) &&
    !has("book_appointment")
  ) {
    actions.push({ type: "book_appointment" });
  }

  if (
    (sessionData.suggestedDoctorId || has("suggest_doctor")) &&
    !sessionData.preferredDatetime &&
    !has("show_slots") &&
    !has("parse_datetime") &&
    /когда|время|слот|удобн|запис/i.test(messageText)
  ) {
    actions.push({ type: "show_slots" });
  }

  return orderAgentActions(actions);
}
