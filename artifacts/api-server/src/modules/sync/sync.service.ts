import { PatientsService } from "../patients/patients.service";
import { DentalRepository } from "../dental/dental.repository";
import { ConflictError, AppError, ValidationError } from "../../shared/errors";
import { isBaseVersionCurrent } from "../../shared/optimistic-concurrency";
import { randomUUID } from "crypto";
import type { PatientStatus, ToothCondition, UserRole } from "@workspace/db";

export type SyncOpType =
  | "update_patient"
  | "update_patient_status"
  | "update_tooth"
  | "add_interaction";

export interface SyncOpInput {
  clientOpId: string;
  type: SyncOpType;
  resourceId: string;
  toothFdi?: number;
  baseUpdatedAt?: string | null;
  payload: Record<string, unknown>;
  clientTimestamp?: string;
}

export type SyncOpResultStatus = "applied" | "conflict" | "error" | "skipped";

export interface SyncOpResult {
  clientOpId: string;
  status: SyncOpResultStatus;
  data?: unknown;
  error?: string;
  code?: string;
}

function serializeEntity(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeEntity);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = serializeEntity(v);
  }
  return out;
}

export class SyncService {
  private patients = new PatientsService();
  private dental = new DentalRepository();

  async push(
    clinicId: string,
    role: UserRole,
    userId: string,
    ops: SyncOpInput[],
  ): Promise<SyncOpResult[]> {
    const results: SyncOpResult[] = [];
    // Apply sequentially so later ops see earlier writes from the same device.
    for (const op of ops) {
      results.push(await this.applyOne(clinicId, role, userId, op));
    }
    return results;
  }

  private async applyOne(
    clinicId: string,
    role: UserRole,
    userId: string,
    op: SyncOpInput,
  ): Promise<SyncOpResult> {
    if (!op.clientOpId || !op.type || !op.resourceId) {
      return {
        clientOpId: op.clientOpId || "unknown",
        status: "error",
        error: "Invalid sync operation",
        code: "VALIDATION_ERROR",
      };
    }

    try {
      switch (op.type) {
        case "update_patient": {
          const patient = await this.patients.update(
            op.resourceId,
            clinicId,
            op.payload as Parameters<PatientsService["update"]>[2],
            role,
            userId,
            op.baseUpdatedAt,
          );
          return {
            clientOpId: op.clientOpId,
            status: "applied",
            data: { patient: serializeEntity(patient) },
          };
        }
        case "update_patient_status": {
          const status = op.payload.status as PatientStatus | undefined;
          if (!status) {
            throw new ValidationError("status is required");
          }
          const patient = await this.patients.updateStatus(
            op.resourceId,
            clinicId,
            status,
            role,
            userId,
            op.baseUpdatedAt,
          );
          return {
            clientOpId: op.clientOpId,
            status: "applied",
            data: { patient: serializeEntity(patient) },
          };
        }
        case "update_tooth": {
          const toothFdi = op.toothFdi;
          if (toothFdi == null || Number.isNaN(toothFdi)) {
            throw new ValidationError("toothFdi is required");
          }
          const condition = op.payload.condition as ToothCondition | undefined;
          if (!condition) {
            throw new ValidationError("condition is required");
          }
          const notes =
            typeof op.payload.notes === "string" ? op.payload.notes : null;

          const existing = await this.dental.findTooth(
            op.resourceId,
            clinicId,
            toothFdi,
          );
          if (
            existing &&
            !isBaseVersionCurrent(existing.updatedAt, op.baseUpdatedAt)
          ) {
            throw new ConflictError(
              "Карта зуба была изменена другим пользователем. Обновите данные и повторите изменение.",
              { entity: "tooth", current: serializeEntity(existing) },
              "VERSION_CONFLICT",
            );
          }

          const tooth = await this.dental.upsertTooth({
            id: randomUUID(),
            clinicId,
            patientId: op.resourceId,
            toothFdi,
            condition,
            notes,
            updatedBy: userId,
            updatedAt: new Date(),
          });
          return {
            clientOpId: op.clientOpId,
            status: "applied",
            data: { tooth: serializeEntity(tooth) },
          };
        }
        case "add_interaction": {
          const type = op.payload.type;
          const content = op.payload.content;
          if (typeof type !== "string" || typeof content !== "string") {
            throw new ValidationError("type and content are required");
          }
          const interaction = await this.patients.addInteraction(
            op.resourceId,
            clinicId,
            {
              type: type as Parameters<PatientsService["addInteraction"]>[2]["type"],
              content,
              userId,
            },
            role,
            userId,
          );
          return {
            clientOpId: op.clientOpId,
            status: "applied",
            data: { interaction: serializeEntity(interaction) },
          };
        }
        default:
          return {
            clientOpId: op.clientOpId,
            status: "skipped",
            error: `Unsupported op type: ${String(op.type)}`,
            code: "UNSUPPORTED_OP",
          };
      }
    } catch (err) {
      if (err instanceof ConflictError) {
        return {
          clientOpId: op.clientOpId,
          status: "conflict",
          data: err.details,
          error: err.message,
          code: err.code,
        };
      }
      if (err instanceof AppError) {
        return {
          clientOpId: op.clientOpId,
          status: "error",
          error: err.message,
          code: err.code,
        };
      }
      const message = err instanceof Error ? err.message : "Unknown sync error";
      return {
        clientOpId: op.clientOpId,
        status: "error",
        error: message,
        code: "INTERNAL_ERROR",
      };
    }
  }
}
