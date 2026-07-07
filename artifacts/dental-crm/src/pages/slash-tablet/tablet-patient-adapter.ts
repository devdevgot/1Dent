import type { Patient, TreatmentPlan } from "@workspace/api-client-react";
import { calculateAge } from "@workspace/api-zod";
import type { PlanItem, PlanStage, TabletPatient, ToothCondition } from "./mock-data";

const STAGE_PALETTE = [
  { color: "#1f75fe", bg: "#eff6ff" },
  { color: "#7c3aed", bg: "#f5f3ff" },
  { color: "#16a34a", bg: "#f0fdf4" },
  { color: "#d97706", bg: "#fffbeb" },
];

/** Технические id этапов (из CRM/AI) → понятные названия для пациента */
const STAGE_LABELS: Record<string, string> = {
  prevention_treatment: "Профилактика и лечение зубов",
  surgery: "Хирургия",
  orthopedics: "Ортопедическое лечение",
  other: "Дополнительные процедуры",
};

function normalizeStageKey(stage: string): string {
  return stage.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function resolveStageLabel(stage: string | null | undefined): string {
  if (!stage?.trim()) return "Лечение";
  const trimmed = stage.trim();
  if (/[а-яё]/i.test(trimmed)) return trimmed;
  const key = normalizeStageKey(trimmed);
  return STAGE_LABELS[key] ?? "Лечение";
}

export function apiPatientToTablet(
  patient: Patient,
  teeth: Record<number, ToothCondition>,
): TabletPatient {
  return {
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    age: patient.dateOfBirth ? calculateAge(patient.dateOfBirth) : 0,
    gender: patient.gender === "female" ? "f" : "m",
    status: patient.status as TabletPatient["status"],
    appointmentTime: "—",
    visitType: "",
    teeth,
    notes: patient.notes ?? undefined,
  };
}

export function apiTeethToMap(
  records: { toothFdi: number; condition: string }[],
): Record<number, ToothCondition> {
  const map: Record<number, ToothCondition> = {};
  for (const tooth of records) {
    map[tooth.toothFdi] = tooth.condition as ToothCondition;
  }
  return map;
}

export function apiPlanToStages(plan: TreatmentPlan | null | undefined): PlanStage[] {
  if (!plan?.items?.length) return [];

  const groups = new Map<string, PlanItem[]>();
  for (const item of [...plan.items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (item.status === "cancelled") continue;
    const rawStage = item.stage?.trim();
    const stageKey = rawStage ? normalizeStageKey(rawStage) : "__default__";
    const list = groups.get(stageKey) ?? [];
    list.push({
      id: item.id,
      tooth: item.toothFdi ?? null,
      title: item.title,
      price: item.price,
      status: item.status === "completed" ? "completed" : "pending",
    });
    groups.set(stageKey, list);
  }

  return Array.from(groups.entries()).map(([stageKey, items], i) => {
    const palette = STAGE_PALETTE[i % STAGE_PALETTE.length]!;
    return {
      id: `stage-${i}`,
      label: stageKey === "__default__" ? "Лечение" : resolveStageLabel(stageKey),
      color: palette.color,
      bg: palette.bg,
      items,
    };
  });
}
