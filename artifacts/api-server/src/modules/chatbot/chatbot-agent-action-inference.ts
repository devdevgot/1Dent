import type { ChatbotSessionData } from "./chatbot.types";
import type { ChatbotAgentAction } from "./chatbot-agent.types";
import { tryParseAppointmentDatetimeLocal } from "./almaty-time";
import { resolveOfficialBranchFromMessage } from "./clinic-knowledge";
import { isReadyToBook, isShortYes } from "./booking-script";
import { hasPatientIdentity } from "./chatbot-patient-identity";

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

/** Ensure set_branch / name / doctor / datetime run before book_appointment in the same turn. */
const ACTION_ORDER: Record<ChatbotAgentAction["type"], number> = {
  set_branch: 10,
  set_patient_name: 20,
  suggest_doctor: 30,
  rerank_doctor: 40,
  show_slots: 50,
  parse_datetime: 60,
  book_appointment: 70,
  cancel_appointment: 80,
  reschedule_appointment: 90,
  handoff_operator: 100,
};

export function orderAgentActions(actions: ChatbotAgentAction[]): ChatbotAgentAction[] {
  return [...actions].sort(
    (a, b) => (ACTION_ORDER[a.type] ?? 50) - (ACTION_ORDER[b.type] ?? 50),
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

  const branchReadyThisTurn =
    Boolean(sessionData.selectedBranch) ||
    Boolean(matchedBranch) ||
    officialBranches.length === 1 ||
    has("set_branch");

  const patientConfirmed =
    isShortYes(messageText) || isReadyToBook(messageText) || Boolean(matchedBranch);

  if (
    branchReadyThisTurn &&
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

  const nameReadyThisTurn =
    hasPatientIdentity(sessionData) || has("set_patient_name");
  const datetimeReadyThisTurn =
    Boolean(sessionData.preferredDatetime) || has("parse_datetime");
  const doctorReadyThisTurn =
    Boolean(sessionData.suggestedDoctorId) || has("suggest_doctor");

  // Book when confirmation arrives even if branch/time/name are only being set this turn
  // (orderAgentActions ensures book_appointment runs last).
  if (
    doctorReadyThisTurn &&
    datetimeReadyThisTurn &&
    branchReadyThisTurn &&
    nameReadyThisTurn &&
    patientConfirmed &&
    !has("book_appointment")
  ) {
    actions.push({ type: "book_appointment" });
  }

  if (
    sessionData.suggestedDoctorId &&
    !sessionData.preferredDatetime &&
    !has("show_slots") &&
    !has("parse_datetime") &&
    /когда|время|слот|удобн|запис/i.test(messageText)
  ) {
    actions.push({ type: "show_slots" });
  }

  return orderAgentActions(actions);
}
