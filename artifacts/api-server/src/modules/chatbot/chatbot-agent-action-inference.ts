import type { ChatbotSessionData } from "./chatbot.types";
import type { ChatbotAgentAction } from "./chatbot-agent.types";
import { tryParseAppointmentDatetimeLocal } from "./almaty-time";
import { resolveOfficialBranchFromMessage } from "./clinic-knowledge";
import { isReadyToBook, isShortYes } from "./booking-script";

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
    (sessionData.selectedBranch || officialBranches.length === 1) &&
    !sessionData.suggestedDoctorId &&
    !has("suggest_doctor") &&
    (sessionData.serviceType || sessionData.problemDescription || patientConfirmed)
  ) {
    actions.push({ type: "suggest_doctor" });
  }

  if (
    sessionData.suggestedDoctorId &&
    messageLikelyContainsDatetime(messageText) &&
    !has("parse_datetime")
  ) {
    actions.push({ type: "parse_datetime", datetimeText: messageText });
  }

  if (
    sessionData.suggestedDoctorId &&
    sessionData.preferredDatetime &&
    sessionData.selectedBranch &&
    (isShortYes(messageText) || isReadyToBook(messageText)) &&
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

  return actions;
}
