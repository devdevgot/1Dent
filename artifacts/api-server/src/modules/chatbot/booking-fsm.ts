import type { DoctorCandidate, AdvancedScoringOptions } from "../analytics/analytics.repository";
import { rankDoctorCandidates } from "../analytics/analytics.repository";
import type { ChatbotSessionData } from "./chatbot.types";
import {
  buildBranchPromptFallback,
  buildSymptomsPromptFallback,
} from "./clinic-knowledge";

export type QualificationPhase = "symptoms" | "branch";

export { buildBranchPromptFallback, buildSymptomsPromptFallback };

const ALT_DOCTOR_KEYWORDS = [
  "другой врач",
  "другого врача",
  "замен",
  "не подходит",
  "не этот",
  "басқа дәрігер",
  "басқа врач",
];

export function wantsAlternativeDoctor(text: string): boolean {
  const lower = text.toLowerCase();
  return ALT_DOCTOR_KEYWORDS.some((kw) => lower.includes(kw));
}

export function buildDoctorPresentationFallback(candidate: DoctorCandidate, urgency?: string): string {
  const reason = candidate.reasons[0] ?? "свободные окна";
  const rating =
    candidate.rankPercent >= 55 ? `, рейтинг ${candidate.rankPercent}/100` : "";
  const urgent = urgency === "urgent" ? " Ближайшее окно." : "";
  return `Рекомендую *${candidate.name}* (${reason}${rating}).${urgent} Подходит? (Да / другой врач / Нет)`;
}

export function buildScoringOptionsFromSession(
  data: ChatbotSessionData,
  deterministic?: boolean,
): AdvancedScoringOptions {
  return {
    serviceType: data.serviceType,
    urgency: data.urgency as AdvancedScoringOptions["urgency"],
    patientType: data.patientType as AdvancedScoringOptions["patientType"],
    returningPatientDoctorId: data.returningDoctorId,
    deterministic,
  };
}

export async function assignRankedDoctor(
  clinicId: string,
  data: ChatbotSessionData,
  _dryRun: boolean,
): Promise<{ data: ChatbotSessionData; top: DoctorCandidate | null }> {
  // Playground and WhatsApp must recommend the same top-ranked doctor.
  const scoringOpts = buildScoringOptionsFromSession(data, true);
  const candidates = await rankDoctorCandidates(clinicId, scoringOpts, {
    limit: 3,
    excludeIds: data.excludedDoctorIds ?? [],
  });
  if (candidates.length === 0) {
    return { data, top: null };
  }
  const nextData = {
    ...applyDoctorCandidate(data, candidates[0]!),
    doctorCandidates: serializeDoctorCandidates(candidates),
  };
  return { data: nextData, top: candidates[0]! };
}

export function applyDoctorCandidate(data: ChatbotSessionData, candidate: DoctorCandidate): ChatbotSessionData {
  return {
    ...data,
    suggestedDoctorId: candidate.id,
    suggestedDoctorName: candidate.name,
    doctorPickReason: candidate.reasons.join(", "),
    doctorRankPercent: candidate.rankPercent,
  };
}

export function serializeDoctorCandidates(
  candidates: DoctorCandidate[],
): NonNullable<ChatbotSessionData["doctorCandidates"]> {
  return candidates.map((c) => ({
    id: c.id,
    name: c.name,
    score: c.rankPercent,
    finalScore: c.finalScore,
    reasons: c.reasons,
    specialty: c.specialty,
  }));
}
