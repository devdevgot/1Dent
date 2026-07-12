import type { ChatbotSessionData } from "./chatbot.types";

export const HUMAN_TAKEOVER_AUTO_RESET_MS = 2 * 60 * 60 * 1000;

const BOT_RESUME_KEYWORDS = [
  "бот",
  "продолжить",
  "автоответчик",
  "включи бота",
  "resume bot",
  "continue",
];

export function isBotResumeRequest(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return BOT_RESUME_KEYWORDS.some((kw) => lower.includes(kw));
}

export function shouldAutoResetHumanTakeover(takeoverAt?: string): boolean {
  if (!takeoverAt) return false;
  const at = new Date(takeoverAt).getTime();
  if (Number.isNaN(at)) return false;
  return Date.now() - at >= HUMAN_TAKEOVER_AUTO_RESET_MS;
}

/** Reopen a completed session so the agent can answer new patient questions. */
export function reopenDoneSessionData(data: ChatbotSessionData): ChatbotSessionData {
  const next: ChatbotSessionData = {
    abVariantId: data.abVariantId,
  };
  const patientId = data.existingPatientId ?? data.createdPatientId;
  if (patientId) next.existingPatientId = patientId;
  if (data.patientName) next.patientName = data.patientName;
  if (data.selectedBranch) next.selectedBranch = data.selectedBranch;
  return next;
}

export function stampTakeoverAt(data: ChatbotSessionData): ChatbotSessionData {
  return { ...data, takeoverAt: new Date().toISOString() };
}

export function clearTakeoverAt(data: ChatbotSessionData): ChatbotSessionData {
  const next = { ...data };
  delete next.takeoverAt;
  return next;
}

export function markSessionHumanTakeover(session: {
  humanTakeover: boolean;
  data: ChatbotSessionData;
}): void {
  session.humanTakeover = true;
  session.data = stampTakeoverAt(session.data);
}
