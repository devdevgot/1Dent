import type { Patient, TreatmentPlan } from "@workspace/api-client-react";
import { calculateAge } from "@workspace/api-zod";
import {
  DEFAULT_STAGE_ORDER,
  getTreatmentStageConfig,
  groupTreatmentPlanItemsByStage,
} from "@/components/dental-chart/treatment-stage-config";
import type { PlanItem, PlanStage, TabletPatient, ToothCondition } from "./mock-data";

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

  const groups = groupTreatmentPlanItemsByStage(plan.items);

  return DEFAULT_STAGE_ORDER
    .filter((stageId) => (groups.get(stageId)?.length ?? 0) > 0)
    .map((stageId) => {
      const cfg = getTreatmentStageConfig(stageId)!;
      const items: PlanItem[] = (groups.get(stageId) ?? []).map((item) => ({
        id: item.id,
        tooth: item.toothFdi ?? null,
        title: item.title,
        price: item.price,
        discount: item.discount ?? 0,
        status: item.status === "completed" ? "completed" : "pending",
      }));
      return {
        id: stageId,
        label: cfg.label,
        color: cfg.color,
        bg: cfg.bgColor,
        indexNumber: cfg.indexNumber,
        items,
      };
    });
}
