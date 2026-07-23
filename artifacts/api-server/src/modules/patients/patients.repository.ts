import { db, patientsTable, patientInteractionsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import type {
  Patient,
  InsertPatient,
  PatientInteraction,
  InsertPatientInteraction,
  PatientStatus,
  PatientGender,
  PatientSource,
} from "@workspace/db";

export class PatientsRepository {
  async listByClinic(clinicId: string): Promise<Patient[]> {
    return db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.clinicId, clinicId));
  }

  /**
   * Assign treating physician when the patient has none yet.
   * Used when a procedure/appointment is created with a doctor so the
   * Patients page can show the same doctor as the schedule.
   */
  async assignTreatingDoctorIfEmpty(
    patientId: string,
    clinicId: string,
    doctorId: string,
  ): Promise<void> {
    await db
      .update(patientsTable)
      .set({ doctorId, updatedAt: new Date() })
      .where(
        and(
          eq(patientsTable.id, patientId),
          eq(patientsTable.clinicId, clinicId),
          isNull(patientsTable.doctorId),
        ),
      );
  }

  async findById(id: string, clinicId: string): Promise<Patient | undefined> {
    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(
        and(eq(patientsTable.id, id), eq(patientsTable.clinicId, clinicId)),
      )
      .limit(1);
    return patient;
  }

  async findByIIN(clinicId: string, iin: string): Promise<Patient | null> {
    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(
        and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.iin, iin)),
      )
      .limit(1);
    return patient ?? null;
  }

  async create(data: InsertPatient): Promise<Patient> {
    const [patient] = await db.insert(patientsTable).values(data).returning();
    return patient!;
  }

  async update(
    id: string,
    clinicId: string,
    data: Partial<
      Pick<Patient, "name" | "phone" | "iin" | "dateOfBirth" | "gender" | "source" | "doctorId" | "notes">
    >,
  ): Promise<Patient | undefined> {
    const [patient] = await db
      .update(patientsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(eq(patientsTable.id, id), eq(patientsTable.clinicId, clinicId)),
      )
      .returning();
    return patient;
  }

  async updateStatus(
    id: string,
    clinicId: string,
    status: PatientStatus,
  ): Promise<Patient | undefined> {
    const [patient] = await db
      .update(patientsTable)
      .set({ status, updatedAt: new Date() })
      .where(
        and(eq(patientsTable.id, id), eq(patientsTable.clinicId, clinicId)),
      )
      .returning();
    return patient;
  }

  async delete(id: string, clinicId: string): Promise<void> {
    await db
      .delete(patientsTable)
      .where(
        and(eq(patientsTable.id, id), eq(patientsTable.clinicId, clinicId)),
      );
  }

  async listInteractions(
    patientId: string,
    clinicId: string,
  ): Promise<PatientInteraction[]> {
    return db
      .select()
      .from(patientInteractionsTable)
      .where(
        and(
          eq(patientInteractionsTable.patientId, patientId),
          eq(patientInteractionsTable.clinicId, clinicId),
        ),
      );
  }

  async createInteraction(
    data: InsertPatientInteraction,
  ): Promise<PatientInteraction> {
    const [interaction] = await db
      .insert(patientInteractionsTable)
      .values(data)
      .returning();
    return interaction!;
  }
}
