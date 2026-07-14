import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, doctorHandoffsTable, usersTable } from "@workspace/db";
import { PatientsRepository } from "./patients.repository";
import { ProceduresRepository } from "../procedures/procedures.repository";
import {
  transitionPatientStage,
  PATIENT_STAGE_TRIGGERS,
} from "./patient-stage.service";
import { NotFoundError, ForbiddenError, ValidationError } from "../../shared/errors";
import { parseIIN, isIINError } from "@workspace/api-zod";
import type {
  Patient,
  PatientInteraction,
  PatientStatus,
  PatientSource,
  PatientGender,
  InteractionType,
  UserRole,
} from "@workspace/db";

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
    return patients.map((p) => ({
      ...p,
      phone: maskPhone(p.phone, requestingRole),
    }));
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
    return {
      patient: { ...patient, phone: maskPhone(patient.phone, requestingRole) },
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
    return { ...patient, phone: maskPhone(patient.phone, requestingRole) };
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

    const resolvedDoctorId =
      requestingRole === "doctor" ? requestingUserId : (data.doctorId ?? null);

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

    return { ...patient, phone: maskPhone(patient.phone, requestingRole) };
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
  ): Promise<PatientDTO> {
    const existing = await this.repo.findById(id, clinicId);
    if (!existing) throw new NotFoundError("Patient not found");

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

    const updated = await this.repo.update(id, clinicId, sanitizedData);
    if (!updated) throw new NotFoundError("Patient not found");

    return { ...updated, phone: maskPhone(updated.phone, requestingRole) };
  }

  async updateStatus(
    id: string,
    clinicId: string,
    status: PatientStatus,
    requestingRole: UserRole,
    requestingUserId: string,
  ): Promise<PatientDTO> {
    const existing = await this.repo.findById(id, clinicId);
    if (!existing) throw new NotFoundError("Patient not found");

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

    return { ...updated, phone: maskPhone(updated.phone, requestingRole) };
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
          eq(usersTable.role, "doctor"),
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

    return {
      patient: { ...updated, phone: maskPhone(updated.phone, requestingRole) },
      procedureId: procedure.id,
    };
  }
}
