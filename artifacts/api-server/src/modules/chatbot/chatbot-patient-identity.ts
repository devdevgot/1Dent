import type { ChatbotSessionData } from "./chatbot.types";

export function looksLikeRealPatientName(name: string | undefined): boolean {
  if (!name?.trim()) return false;
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  if (/^\+?\d[\d\s()-]{6,}$/.test(trimmed)) return false;
  return true;
}

export function hasPatientIdentity(data: ChatbotSessionData): boolean {
  return looksLikeRealPatientName(data.patientName);
}
