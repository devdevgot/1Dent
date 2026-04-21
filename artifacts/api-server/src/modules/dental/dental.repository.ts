import {
  db,
  toothRecordsTable,
  toothTreatmentsTable,
  treatmentPlanItemsTable,
  treatmentPlansTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
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

  async listAllTreatments(
    patientId: string,
    clinicId: string,
  ): Promise<ToothTreatment[]> {
    return db
      .select()
      .from(toothTreatmentsTable)
      .where(
        and(
          eq(toothTreatmentsTable.patientId, patientId),
          eq(toothTreatmentsTable.clinicId, clinicId),
        ),
      )
      .orderBy(desc(toothTreatmentsTable.performedAt));
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

  async findTreatment(
    id: string,
    clinicId: string,
  ): Promise<ToothTreatment | null> {
    const [record] = await db
      .select()
      .from(toothTreatmentsTable)
      .where(
        and(
          eq(toothTreatmentsTable.id, id),
          eq(toothTreatmentsTable.clinicId, clinicId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async completeTreatment(id: string): Promise<ToothTreatment> {
    const [updated] = await db
      .update(toothTreatmentsTable)
      .set({ status: "done" })
      .where(eq(toothTreatmentsTable.id, id))
      .returning();
    return updated!;
  }

  async completeTreatmentAndUpdateTooth(
    treatment: ToothTreatment,
    clinicId: string,
    updatedBy: string,
  ): Promise<{ completed: ToothTreatment; tooth: ToothRecord }> {
    const newCondition: ToothCondition = treatment.type === "extraction" ? "missing" : "treated";
    return db.transaction(async (tx) => {
      const [completed] = await tx
        .update(toothTreatmentsTable)
        .set({ status: "done" })
        .where(eq(toothTreatmentsTable.id, treatment.id))
        .returning();

      const [existingTooth] = await tx
        .select()
        .from(toothRecordsTable)
        .where(
          and(
            eq(toothRecordsTable.patientId, treatment.patientId),
            eq(toothRecordsTable.clinicId, clinicId),
            eq(toothRecordsTable.toothFdi, treatment.toothFdi),
          ),
        )
        .limit(1);

      let tooth: ToothRecord;
      if (existingTooth) {
        const [updated] = await tx
          .update(toothRecordsTable)
          .set({ condition: newCondition, updatedBy, updatedAt: new Date() })
          .where(eq(toothRecordsTable.id, existingTooth.id))
          .returning();
        tooth = updated!;
      } else {
        const [created] = await tx
          .insert(toothRecordsTable)
          .values({
            id: randomUUID(),
            clinicId,
            patientId: treatment.patientId,
            toothFdi: treatment.toothFdi,
            condition: newCondition,
            notes: null,
            updatedBy,
            updatedAt: new Date(),
          })
          .returning();
        tooth = created!;
      }

      const [matchingPlanItem] = await tx
        .select()
        .from(treatmentPlanItemsTable)
        .where(
          and(
            eq(treatmentPlanItemsTable.clinicId, clinicId),
            eq(treatmentPlanItemsTable.patientId, treatment.patientId),
            eq(treatmentPlanItemsTable.toothFdi, treatment.toothFdi),
            eq(treatmentPlanItemsTable.title, treatment.description),
            eq(treatmentPlanItemsTable.status, "pending"),
          ),
        )
        .limit(1);

      if (matchingPlanItem) {
        await tx
          .update(treatmentPlanItemsTable)
          .set({ status: "completed" })
          .where(eq(treatmentPlanItemsTable.id, matchingPlanItem.id));

        const allItems = await tx
          .select()
          .from(treatmentPlanItemsTable)
          .where(eq(treatmentPlanItemsTable.planId, matchingPlanItem.planId));

        const allCompleted = allItems.every(
          (item) => item.status === "completed" || item.status === "cancelled",
        );

        await tx
          .update(treatmentPlansTable)
          .set({
            status: allCompleted ? "completed" : "in_progress",
            updatedAt: new Date(),
          })
          .where(eq(treatmentPlansTable.id, matchingPlanItem.planId));
      }

      return { completed: completed!, tooth };
    });
  }
}
