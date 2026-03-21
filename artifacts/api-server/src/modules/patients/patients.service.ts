import { randomUUID } from "crypto";
import { PatientsRepository } from "./patients.repository";
import { NotFoundError, ForbiddenError } from "../../shared/errors";
import type {
  Patient,
  PatientInteraction,
  PatientStatus,
  PatientSource,
  InteractionType,
  UserRole,
} from "@workspace/db";

function maskPhone(phone: string, role: UserRole): string {
  if (role === "doctor") {
    // Show only last 2 digits: +7 *** *** **XX
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

  async list(
    clinicId: string,
    requestingRole: UserRole,
    requestingUserId: string,
  ): Promise<PatientDTO[]> {
    const doctorFilter =
      requestingRole === "doctor" ? requestingUserId : undefined;
    const patients = await this.repo.listByClinic(clinicId, doctorFilter);
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

    if (requestingRole === "doctor" && patient.doctorId !== requestingUserId) {
      throw new ForbiddenError("Access denied");
    }

    const interactions = await this.repo.listInteractions(id, clinicId);
    return {
      patient: { ...patient, phone: maskPhone(patient.phone, requestingRole) },
      interactions,
    };
  }

  async create(
    clinicId: string,
    data: {
      name: string;
      phone: string;
      age?: number;
      source?: PatientSource;
      doctorId?: string;
      notes?: string;
    },
    requestingRole: UserRole,
    requestingUserId: string,
  ): Promise<PatientDTO> {
    if (!["owner", "admin", "doctor"].includes(requestingRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }

    // Doctors always own the patients they create; ignore client-provided doctorId
    const resolvedDoctorId =
      requestingRole === "doctor" ? requestingUserId : (data.doctorId ?? null);

    const patient = await this.repo.create({
      id: randomUUID(),
      clinicId,
      name: data.name,
      phone: data.phone,
      age: data.age ?? null,
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
      age: number;
      source: PatientSource;
      doctorId: string;
      notes: string;
    }>,
    requestingRole: UserRole,
    requestingUserId: string,
  ): Promise<PatientDTO> {
    const existing = await this.repo.findById(id, clinicId);
    if (!existing) throw new NotFoundError("Patient not found");

    if (requestingRole === "doctor" && existing.doctorId !== requestingUserId) {
      throw new ForbiddenError("Access denied");
    }

    const updated = await this.repo.update(id, clinicId, data);
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

    if (requestingRole === "doctor" && existing.doctorId !== requestingUserId) {
      throw new ForbiddenError("Access denied");
    }

    const updated = await this.repo.updateStatus(id, clinicId, status);
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

    if (
      requestingRole === "doctor" &&
      patient.doctorId !== requestingUserId
    ) {
      throw new ForbiddenError("Access denied");
    }

    return this.repo.createInteraction({
      id: randomUUID(),
      patientId,
      clinicId,
      userId: data.userId,
      type: data.type,
      content: data.content,
    });
  }
}
