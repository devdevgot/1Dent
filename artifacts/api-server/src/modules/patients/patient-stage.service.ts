import { randomUUID } from "crypto";
import type { PatientStatus } from "@workspace/db";
import type { PatientsRepository } from "./patients.repository";
import { logger } from "../../lib/logger";

export const PATIENT_STAGE_TRIGGERS = {
  APPOINTMENT_CREATED: "appointment_created",
  DIAGNOSIS_STARTED: "diagnosis_started",
  DIAGNOSIS_COMPLETED: "diagnosis_completed",
  TREATMENT_PLAN_APPROVED: "treatment_plan_approved",
  TREATMENT_STARTED: "treatment_started",
  TREATMENT_COMPLETED: "treatment_completed",
  POST_OP_FOLLOWUP_SENT: "post_op_followup_sent",
  POST_OP_OK_REPLY: "post_op_ok_reply",
  BROADCAST_SENT: "broadcast_sent",
  REPEAT_SALE_OPT_OUT: "repeat_sale_opt_out",
  REPEAT_SALE_BOOKING_INTEREST: "repeat_sale_booking_interest",
  MANUAL: "manual",
} as const;

export type PatientStageTrigger =
  (typeof PATIENT_STAGE_TRIGGERS)[keyof typeof PATIENT_STAGE_TRIGGERS];

/** Main funnel order — used for forward-only auto transitions. */
export const MAIN_FUNNEL_STATUSES: readonly PatientStatus[] = [
  "new_request",
  "initial_consultation",
  "diagnostics",
  "treatment_assigned",
  "treatment_in_progress",
  "payment_processing",
  "post_op_monitoring",
  "completed",
  "repeat_sale",
] as const;

/** Patients eligible for dental re-engagement broadcast. */
export const BROADCAST_ELIGIBLE_STATUSES: readonly PatientStatus[] = [
  "diagnostics",
  "treatment_assigned",
  "completed",
  "repeat_sale",
  "post_op_monitoring",
] as const;

const STAGE_ORDER: Partial<Record<PatientStatus, number>> = Object.fromEntries(
  MAIN_FUNNEL_STATUSES.map((status, index) => [status, index]),
);

export interface StageTransitionResult {
  changed: boolean;
  from: PatientStatus | null;
  to: PatientStatus;
  blocked?: boolean;
}

export type PatientStageRepo = Pick<
  PatientsRepository,
  "findById" | "updateStatus" | "createInteraction"
>;

let defaultRepo: PatientStageRepo | undefined;

async function getDefaultRepo(): Promise<PatientStageRepo> {
  if (!defaultRepo) {
    const { PatientsRepository } = await import("./patients.repository");
    defaultRepo = new PatientsRepository();
  }
  return defaultRepo;
}

/**
 * Auto transitions may only move forward in the main funnel, or use explicit
 * re-engagement paths (repeat_sale → initial_consultation / rejected).
 * Manual moves (owner/admin drag) bypass FSM.
 */
export function isStageTransitionAllowed(
  from: PatientStatus,
  to: PatientStatus,
  trigger: string,
): boolean {
  if (from === to) return false;

  if (trigger === PATIENT_STAGE_TRIGGERS.MANUAL) return true;

  if (from === "repeat_sale" && (to === "initial_consultation" || to === "rejected")) {
    return true;
  }

  const fromIdx = STAGE_ORDER[from];
  const toIdx = STAGE_ORDER[to];
  if (fromIdx !== undefined && toIdx !== undefined && toIdx > fromIdx) {
    return true;
  }

  return false;
}

export async function transitionPatientStage(params: {
  patientId: string;
  clinicId: string;
  toStatus: PatientStatus;
  trigger: string;
  actorId?: string;
  repo?: PatientStageRepo;
}): Promise<StageTransitionResult> {
  const repo = params.repo ?? (await getDefaultRepo());
  const existing = await repo.findById(params.patientId, params.clinicId);

  if (!existing) {
    return { changed: false, from: null, to: params.toStatus };
  }

  if (existing.status === params.toStatus) {
    return { changed: false, from: existing.status, to: params.toStatus };
  }

  if (!isStageTransitionAllowed(existing.status, params.toStatus, params.trigger)) {
    logger.warn(
      {
        patientId: params.patientId,
        clinicId: params.clinicId,
        from: existing.status,
        to: params.toStatus,
        trigger: params.trigger,
      },
      "[PatientStage] Blocked invalid auto transition",
    );
    return {
      changed: false,
      from: existing.status,
      to: params.toStatus,
      blocked: true,
    };
  }

  const updated = await repo.updateStatus(
    params.patientId,
    params.clinicId,
    params.toStatus,
  );
  if (!updated) {
    return { changed: false, from: existing.status, to: params.toStatus };
  }

  await repo.createInteraction({
    id: randomUUID(),
    patientId: params.patientId,
    clinicId: params.clinicId,
    userId: params.actorId ?? null,
    type: "status_change",
    content: `${existing.status} → ${params.toStatus} (${params.trigger})`,
  });

  return {
    changed: true,
    from: existing.status,
    to: params.toStatus,
  };
}
