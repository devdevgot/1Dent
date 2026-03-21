import {
  db,
  toothRecordsTable,
  toothTreatmentsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type {
  ToothRecord,
  InsertToothRecord,
  ToothTreatment,
  InsertToothTreatment,
  ToothCondition,
} from "@workspace/db";

export class DentalRepository {
  async listTeeth(patientId: string, clinicId: string): Promise<ToothRecord[]> {
    return db
      .select()
      .from(toothRecordsTable)
      .where(
        and(
          eq(toothRecordsTable.patientId, patientId),
          eq(toothRecordsTable.clinicId, clinicId),
        ),
      );
  }

  async findTooth(
    patientId: string,
    clinicId: string,
    toothFdi: number,
  ): Promise<ToothRecord | undefined> {
    const [record] = await db
      .select()
      .from(toothRecordsTable)
      .where(
        and(
          eq(toothRecordsTable.patientId, patientId),
          eq(toothRecordsTable.clinicId, clinicId),
          eq(toothRecordsTable.toothFdi, toothFdi),
        ),
      )
      .limit(1);
    return record;
  }

  async upsertTooth(
    data: InsertToothRecord,
  ): Promise<ToothRecord> {
    const existing = await this.findTooth(data.patientId, data.clinicId, data.toothFdi);
    if (existing) {
      const [updated] = await db
        .update(toothRecordsTable)
        .set({
          condition: data.condition as ToothCondition,
          notes: data.notes,
          updatedBy: data.updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(toothRecordsTable.id, existing.id))
        .returning();
      return updated!;
    }
    const [created] = await db
      .insert(toothRecordsTable)
      .values(data)
      .returning();
    return created!;
  }

  async listTreatments(
    patientId: string,
    clinicId: string,
    toothFdi: number,
  ): Promise<ToothTreatment[]> {
    return db
      .select()
      .from(toothTreatmentsTable)
      .where(
        and(
          eq(toothTreatmentsTable.patientId, patientId),
          eq(toothTreatmentsTable.clinicId, clinicId),
          eq(toothTreatmentsTable.toothFdi, toothFdi),
        ),
      );
  }

  async addTreatment(data: InsertToothTreatment): Promise<ToothTreatment> {
    const [treatment] = await db
      .insert(toothTreatmentsTable)
      .values(data)
      .returning();
    return treatment!;
  }
}
