import { db, patientsTable, patientInteractionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type {
  Patient,
  InsertPatient,
  PatientInteraction,
  InsertPatientInteraction,
  PatientStatus,
} from "@workspace/db";

export class PatientsRepository {
  async listByClinic(clinicId: string, doctorId?: string): Promise<Patient[]> {
    if (doctorId) {
      return db
        .select()
        .from(patientsTable)
        .where(
          and(
            eq(patientsTable.clinicId, clinicId),
            eq(patientsTable.doctorId, doctorId),
          ),
        );
    }
    return db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.clinicId, clinicId));
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

  async create(data: InsertPatient): Promise<Patient> {
    const [patient] = await db.insert(patientsTable).values(data).returning();
    return patient!;
  }

  async update(
    id: string,
    clinicId: string,
    data: Partial<
      Pick<Patient, "name" | "phone" | "age" | "source" | "doctorId" | "notes">
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
