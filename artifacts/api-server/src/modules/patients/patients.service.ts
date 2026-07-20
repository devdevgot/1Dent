import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, doctorHandoffsTable, usersTable } from "@workspace/db";
import { PatientsRepository } from "./patients.repository";
import { ProceduresRepository } from "../procedures/procedures.repository";
import {
  transitionPatientStage,
  PATIENT_STAGE_TRIGGERS,
} from "./patient-stage.service";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from "../../shared/errors";
import { isBaseVersionCurrent } from "../../shared/optimistic-concurrency";
import { parseIIN, isIINError } from "@workspace/api-zod";
import { TREATING_DOCTOR_ROLES } from "../../lib/clinical-roles";
import type {
  Patient,
  PatientInteraction,
  PatientStatus,
  PatientSource,
  PatientGender,
  InteractionType,
  UserRole,
} from "@workspace/db";

function assertPatientVersion(
  existing: Patient,
  baseUpdatedAt?: string | null,
): void {
  if (isBaseVersionCurrent(existing.updatedAt, baseUpdatedAt)) return;
  throw new ConflictError(
    "Пациент был изменён другим пользователем. Обновите данные и повторите изменение.",
    { entity: "patient", current: existing },
    "VERSION_CONFLICT",
  );
}

function maskPhone(phone: string, role: UserRole): string {
  if (role === "doctor" || role === "assistant" || role === "nurse") {
    const cleaned = phone.replace(/\D/g, "");
    const last2 = cleaned.slice(-2);
    return `+7 *** *** **${last2}`;
  }
  return phone;
}

export interface PatientDTO extends Omit<Patient, "phone"> {
  phone: string;
  /** Resolved treating-physician name (doctor or owner). */
  doctorName?: string | null;
}

async function doctorNameMapForIds(
  doctorIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = [...new Set(doctorIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(inArray(usersTable.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

function withDoctorName(
  patient: Patient,
  phone: string,
  names: Map<string, string>,
): PatientDTO {
  return {
    ...patient,
    phone,
    doctorName: patient.doctorId ? (names.get(patient.doctorId) ?? null) : null,
  };
}

export class PatientsService {
  private repo = new PatientsRepository();
  private proceduresRepo = new ProceduresRepository();

  async list(
    clinicId: string,
    requestingRole: UserRole,
    _requestingUserId: string,
  ): Promise<PatientDTO[]> {
    const patients = await this.repo.listByClinic(clinicId);
    const names = await doctorNameMapForIds(patients.map((p) => p.doctorId));
    return patients.map((p) =>
      withDoctorName(p, maskPhone(p.phone, requestingRole), names),
    );
  }

  async get(
    id: string,
    clinicId: string,
    requestingRole: UserRole,
    requestingUserId: string,
  ): Promise<{ patient: PatientDTO; interactions: PatientInteraction[] }> {
    const patient = await this.repo.findById(id, clinicId);
    if (!patient) throw new NotFoundError("Patient not found");

    const interactions = await this.repo.listInteractions(id, clinicId);
    const names = await doctorNameMapForIds([patient.doctorId]);
    return {
      patient: withDoctorName(patient, maskPhone(patient.phone, requestingRole), names),
      interactions,
    };
  }

  async findByIIN(
    clinicId: string,
    iin: string,
    requestingRole: UserRole,
    _requestingUserId: string,
  ): Promise<PatientDTO | null> {
    const patient = await this.repo.findByIIN(clinicId, iin);
    if (!patient) return null;
    const names = await doctorNameMapForIds([patient.doctorId]);
    return withDoctorName(patient, maskPhone(patient.phone, requestingRole), names);
  }

  async create(
    clinicId: string,
    data: {
      name: string;
      phone: string;
      iin?: string;
      dateOfBirth?: string;
      gender?: PatientGender;
      source?: string;
      doctorId?: string;
      notes?: string;
    },
    requestingRole: UserRole,
    requestingUserId: string,
  ): Promise<PatientDTO> {
    if (!["owner", "admin", "doctor"].includes(requestingRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }

    let resolvedDoctorId: string | null =
      requestingRole === "doctor" ? requestingUserId : (data.doctorId ?? null);

    if (resolvedDoctorId && requestingRole !== "doctor") {
      const [assignee] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.id, resolvedDoctorId),
            eq(usersTable.clinicId, clinicId),
            inArray(usersTable.role, [...TREATING_DOCTOR_ROLES]),
          ),
        )
        .limit(1);
      if (!assignee) {
        throw new ValidationError("Выбранный лечащий врач не найден в клинике");
      }
    }

    let resolvedIIN = data.iin ?? null;
    let resolvedDateOfBirth = data.dateOfBirth ?? null;
    let resolvedGender = data.gender ?? null;

    if (resolvedIIN) {
      const iinResult = parseIIN(resolvedIIN);
      if (!isIINError(iinResult)) {
        if (!resolvedDateOfBirth) {
          resolvedDateOfBirth = iinResult.dateOfBirth.toISOString().slice(0, 10);
        }
        if (!resolvedGender) {
          resolvedGender = iinResult.gender;
        }
      }
    }

    const patient = await this.repo.create({
      id: randomUUID(),
      clinicId,
      name: data.name,
      phone: data.phone,
      iin: resolvedIIN,
      dateOfBirth: resolvedDateOfBirth,
      gender: resolvedGender,
      source: data.source ?? "other",
      doctorId: resolvedDoctorId,
      notes: data.notes ?? null,
      status: "new_request",
    });

    const names = await doctorNameMapForIds([patient.doctorId]);
    return withDoctorName(patient, maskPhone(patient.phone, requestingRole), names);
  }

  async update(
    id: string,
    clinicId: string,
    data: Partial<{
      name: string;
      phone: string;
      iin: string;
      dateOfBirth: string;
      gender: PatientGender;
      source: string;
      doctorId: string;
      notes: string;
    }>,
    requestingRole: UserRole,
    requestingUserId: string,
    baseUpdatedAt?: string | null,
  ): Promise<PatientDTO> {
    const existing = await this.repo.findById(id, clinicId);
    if (!existing) throw new NotFoundError("Patient not found");
    assertPatientVersion(existing, baseUpdatedAt);

    const sanitizedData = { ...data };
    if (requestingRole === "doctor") {
      delete sanitizedData.doctorId;
    }

    if (sanitizedData.iin) {
      const iinResult = parseIIN(sanitizedData.iin);
      if (!isIINError(iinResult)) {
        if (!sanitizedData.dateOfBirth) {
          sanitizedData.dateOfBirth = iinResult.dateOfBirth.toISOString().slice(0, 10);
        }
        if (!sanitizedData.gender) {
          sanitizedData.gender = iinResult.gender;
        }
      }
    }

    if (sanitizedData.doctorId) {
      const [assignee] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.id, sanitizedData.doctorId),
            eq(usersTable.clinicId, clinicId),
            inArray(usersTable.role, [...TREATING_DOCTOR_ROLES]),
          ),
        )
        .limit(1);
      if (!assignee) {
        throw new ValidationError("Выбранный лечащий врач не найден в клинике");
      }
    }

    const updated = await this.repo.update(id, clinicId, sanitizedData);
    if (!updated) throw new NotFoundError("Patient not found");

    const names = await doctorNameMapForIds([updated.doctorId]);
    return withDoctorName(updated, maskPhone(updated.phone, requestingRole), names);
  }

  async updateStatus(
    id: string,
    clinicId: string,
    status: PatientStatus,
    requestingRole: UserRole,
    requestingUserId: string,
    baseUpdatedAt?: string | null,
  ): Promise<PatientDTO> {
    const existing = await this.repo.findById(id, clinicId);
    if (!existing) throw new NotFoundError("Patient not found");
    assertPatientVersion(existing, baseUpdatedAt);

    await transitionPatientStage({
      patientId: id,
      clinicId,
      toStatus: status,
      trigger: PATIENT_STAGE_TRIGGERS.MANUAL,
      actorId: requestingUserId,
      repo: this.repo,
    });

    const updated = await this.repo.findById(id, clinicId);
    if (!updated) throw new NotFoundError("Patient not found");

    const names = await doctorNameMapForIds([updated.doctorId]);
    return withDoctorName(updated, maskPhone(updated.phone, requestingRole), names);
  }

  async delete(
    id: string,
    clinicId: string,
    requestingRole: UserRole,
  ): Promise<void> {
    if (!["owner", "admin"].includes(requestingRole)) {
      throw new ForbiddenError("Only owners and admins can delete patients");
    }

    const existing = await this.repo.findById(id, clinicId);
    if (!existing) throw new NotFoundError("Patient not found");

    await this.repo.delete(id, clinicId);
  }

  async addInteraction(
    patientId: string,
    clinicId: string,
    data: {
      type: InteractionType;
      content: string;
      userId: string;
    },
    requestingRole: UserRole,
    requestingUserId: string,
  ): Promise<PatientInteraction> {
    const patient = await this.repo.findById(patientId, clinicId);
    if (!patient) throw new NotFoundError("Patient not found");

    return this.repo.createInteraction({
      id: randomUUID(),
      patientId,
      clinicId,
      userId: data.userId,
      type: data.type,
      content: data.content,
    });
  }

  async transfer(
    id: string,
    clinicId: string,
    data: {
      toDoctorId: string;
      scheduledAt: string;
      reason?: string;
    },
    requestingRole: UserRole,
    requestingUserId: string,
  ): Promise<{ patient: PatientDTO; procedureId: string }> {
    if (!["owner", "admin", "doctor"].includes(requestingRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }

    const existing = await this.repo.findById(id, clinicId);
    if (!existing) throw new NotFoundError("Patient not found");

    const fromDoctorId = existing.doctorId;

    if (requestingRole === "doctor") {
      if (!fromDoctorId || fromDoctorId !== requestingUserId) {
        throw new ForbiddenError("Вы можете передать только своих пациентов");
      }
    }

    if (fromDoctorId === data.toDoctorId) {
      throw new ValidationError("Пациент уже назначен на этого врача");
    }

    const [toDoctor] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, data.toDoctorId),
          eq(usersTable.clinicId, clinicId),
          inArray(usersTable.role, [...TREATING_DOCTOR_ROLES]),
        ),
      )
      .limit(1);

    if (!toDoctor) {
      throw new NotFoundError("Целевой врач не найден в этой клинике");
    }

    const scheduledDate = new Date(data.scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      throw new ValidationError("Некорректная дата и время приёма");
    }
    if (scheduledDate.getTime() < Date.now()) {
      throw new ValidationError("Нельзя записать на прошедшее время");
    }

    const updated = await this.repo.update(id, clinicId, { doctorId: data.toDoctorId });
    if (!updated) throw new NotFoundError("Patient not found");

    const procedureId = randomUUID();
    const procedure = await this.proceduresRepo.create({
      id: procedureId,
      clinicId,
      patientId: id,
      doctorId: data.toDoctorId,
      name: "Передача пациента",
      notes: data.reason ?? undefined,
      scheduledAt: scheduledDate,
    });

    if (fromDoctorId) {
      await db.insert(doctorHandoffsTable).values({
        id: randomUUID(),
        clinicId,
        fromDoctorId,
        toDoctorId: data.toDoctorId,
        procedureId,
        reason: data.reason ?? null,
      });
    }

    const fromDoctorName = fromDoctorId
      ? (
          await db
            .select({ name: usersTable.name })
            .from(usersTable)
            .where(eq(usersTable.id, fromDoctorId))
            .limit(1)
        )[0]?.name ?? "предыдущего врача"
      : "предыдущего врача";

    await this.repo.createInteraction({
      id: randomUUID(),
      patientId: id,
      clinicId,
      userId: requestingUserId,
      type: "appointment",
      content: `Пациент передан от ${fromDoctorName} к ${toDoctor.name}. Запись: ${scheduledDate.toLocaleString("ru-RU")}`,
    });

    const names = await doctorNameMapForIds([updated.doctorId]);
    return {
      patient: withDoctorName(updated, maskPhone(updated.phone, requestingRole), names),
      procedureId: procedure.id,
    };
  }
}
