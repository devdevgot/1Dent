import type { DoctorCandidate, AdvancedScoringOptions } from "../analytics/analytics.repository";
import { rankDoctorCandidates } from "../analytics/analytics.repository";
import type { ChatbotSessionData } from "./chatbot.types";
import {
  buildBranchPromptFallback,
  buildSymptomsPromptFallback,
} from "./clinic-knowledge";
import { getClinicDoctorsLightweight } from "./calendar-slots";

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

/** When KPI ranking is empty, fall back to the same active treating-doctor pool used for slots. */
async function fallbackTreatingDoctorCandidate(
  clinicId: string,
  excludeIds: string[],
): Promise<DoctorCandidate | null> {
  const excluded = new Set(excludeIds);
  const doctors = await getClinicDoctorsLightweight(clinicId);
  const pick = doctors.find((d) => !excluded.has(d.id));
  if (!pick) return null;
  return {
    id: pick.id,
    name: pick.name,
    specialty: pick.specialty,
    finalScore: 50,
    rankPercent: 50,
    hasCapacity: true,
    nearestSlotMinutes: null,
    reasons: ["доступен для записи"],
  };
}

export async function assignRankedDoctor(
  clinicId: string,
  data: ChatbotSessionData,
  _dryRun: boolean,
): Promise<{ data: ChatbotSessionData; top: DoctorCandidate | null }> {
  // Playground and WhatsApp must recommend the same top-ranked doctor.
  const scoringOpts = buildScoringOptionsFromSession(data, true);
  const excludeIds = data.excludedDoctorIds ?? [];
  let candidates = await rankDoctorCandidates(clinicId, scoringOpts, {
    limit: 3,
    excludeIds,
  });
  if (candidates.length === 0) {
    const fallback = await fallbackTreatingDoctorCandidate(clinicId, excludeIds);
    if (!fallback) {
      return { data, top: null };
    }
    candidates = [fallback];
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
