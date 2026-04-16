import {
  db,
  treatmentPlansTable,
  treatmentPlanItemsTable,
  toothRecordsTable,
  toothTreatmentsTable,
  proceduresTable,
  CONDITION_MKB10,
} from "@workspace/db";
import { eq, and, desc, ne, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import type {
  TreatmentPlan,
  TreatmentPlanItem,
  TreatmentPlanStatus,
  TreatmentPlanItemStatus,
  ToothCondition,
} from "@workspace/db";
import type { ConditionPricesMap } from "../clinic/clinic-prices.repository";

export type TreatmentPlanWithItems = TreatmentPlan & { items: TreatmentPlanItem[] };

const CONDITION_LABEL: Record<string, string> = {
  healthy: "Здоровый зуб",
  cavity: "Кариес",
  treated: "Леченый зуб",
  crown: "Коронка",
  root_canal: "Корневой канал",
  implant: "Имплант",
  missing: "Удалённый зуб",
  extraction_needed: "Удаление зуба",
};

export class PlanLockedError extends Error {
  constructor() {
    super("Plan is locked — structural edits are not allowed after approval");
  }
}

export class ItemAlreadyCompletedError extends Error {
  constructor() {
    super("Item is already completed or cancelled");
  }
}

export class TreatmentPlansRepository {
  async getActivePlan(patientId: string, clinicId: string): Promise<TreatmentPlanWithItems | null> {
    const [plan] = await db
      .select()
      .from(treatmentPlansTable)
      .where(
        and(
          eq(treatmentPlansTable.patientId, patientId),
          eq(treatmentPlansTable.clinicId, clinicId),
          ne(treatmentPlansTable.status, "completed"),
        ),
      )
      .orderBy(desc(treatmentPlansTable.createdAt))
      .limit(1);

    if (!plan) return null;

    const items = await db
      .select()
      .from(treatmentPlanItemsTable)
      .where(eq(treatmentPlanItemsTable.planId, plan.id))
      .orderBy(treatmentPlanItemsTable.sortOrder, treatmentPlanItemsTable.createdAt);

    return { ...plan, items };
  }

  async listPlans(patientId: string, clinicId: string): Promise<TreatmentPlanWithItems[]> {
    const plans = await db
      .select()
      .from(treatmentPlansTable)
      .where(
        and(
          eq(treatmentPlansTable.patientId, patientId),
          eq(treatmentPlansTable.clinicId, clinicId),
        ),
      )
      .orderBy(desc(treatmentPlansTable.createdAt));

    if (!plans.length) return [];

    const planIds = plans.map((p) => p.id);
    const allItems = await db
      .select()
      .from(treatmentPlanItemsTable)
      .where(inArray(treatmentPlanItemsTable.planId, planIds))
      .orderBy(treatmentPlanItemsTable.sortOrder, treatmentPlanItemsTable.createdAt);

    return plans.map((plan) => ({
      ...plan,
      items: allItems.filter((i) => i.planId === plan.id),
    }));
  }

  async createPlan(
    clinicId: string,
    patientId: string,
    doctorId: string | null,
    pricesMap: ConditionPricesMap,
    manualItems?: Array<{ toothFdi?: number; condition?: string; mkb10Code?: string; title: string; price: number }>,
  ): Promise<TreatmentPlanWithItems> {
    return db.transaction(async (tx) => {
      const planId = randomUUID();

      let itemsData: Array<{
        id: string; planId: string; clinicId: string; patientId: string;
        toothFdi: number | null; condition: ToothCondition | null; mkb10Code: string | null;
        title: string; price: number; status: TreatmentPlanItemStatus; sortOrder: number;
        procedureId: string | null; createdAt: Date;
      }> = [];

      if (manualItems && manualItems.length > 0) {
        itemsData = manualItems.map((item, idx) => ({
          id: randomUUID(),
          planId,
          clinicId,
          patientId,
          toothFdi: item.toothFdi ?? null,
          condition: (item.condition ?? null) as ToothCondition | null,
          mkb10Code: item.mkb10Code ?? null,
          title: item.title,
          price: item.price,
          status: "pending" as TreatmentPlanItemStatus,
          sortOrder: idx,
          procedureId: null,
          createdAt: new Date(),
        }));
      } else {
        const teeth = await tx
          .select()
          .from(toothRecordsTable)
          .where(
            and(
              eq(toothRecordsTable.patientId, patientId),
              eq(toothRecordsTable.clinicId, clinicId),
            ),
          );

        const problemTeeth = teeth.filter(
          (t) => t.condition !== "healthy" && t.condition !== "treated" && t.condition !== "missing",
        );

        itemsData = problemTeeth.map((tooth, idx) => {
          const cond = tooth.condition as string;
          const priceEntry = pricesMap[cond];
          return {
            id: randomUUID(),
            planId,
            clinicId,
            patientId,
            toothFdi: tooth.toothFdi,
            condition: tooth.condition as ToothCondition | null,
            mkb10Code: priceEntry?.mkb10 ?? CONDITION_MKB10[cond] ?? null,
            title: `${CONDITION_LABEL[cond] ?? cond} — зуб #${tooth.toothFdi}`,
            price: priceEntry?.price ?? 0,
            status: "pending" as TreatmentPlanItemStatus,
            sortOrder: idx,
            procedureId: null,
            createdAt: new Date(),
          };
        });
      }

      const totalCost = itemsData.reduce((sum, i) => sum + i.price, 0);

      const [plan] = await tx
        .insert(treatmentPlansTable)
        .values({
          id: planId,
          clinicId,
          patientId,
          doctorId,
          status: "draft",
          notes: null,
          totalCost,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      let items: TreatmentPlanItem[] = [];
      if (itemsData.length > 0) {
        items = await tx
          .insert(treatmentPlanItemsTable)
          .values(itemsData)
          .returning();
      }

      return { ...plan!, items };
    });
  }

  private async _getPlanWithItems(planId: string, clinicId: string): Promise<TreatmentPlanWithItems | null> {
    const [plan] = await db
      .select()
      .from(treatmentPlansTable)
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.clinicId, clinicId)))
      .limit(1);
    if (!plan) return null;
    const items = await db
      .select()
      .from(treatmentPlanItemsTable)
      .where(eq(treatmentPlanItemsTable.planId, planId))
      .orderBy(treatmentPlanItemsTable.sortOrder, treatmentPlanItemsTable.createdAt);
    return { ...plan, items };
  }

  async updatePlan(
    planId: string,
    clinicId: string,
    updates: { notes?: string | null; status?: TreatmentPlanStatus },
  ): Promise<TreatmentPlanWithItems | null> {
    const [updated] = await db
      .update(treatmentPlansTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.clinicId, clinicId)))
      .returning();
    if (!updated) return null;
    return this._getPlanWithItems(planId, clinicId);
  }

  async approvePlan(planId: string, clinicId: string): Promise<TreatmentPlanWithItems | null> {
    const [plan] = await db
      .select()
      .from(treatmentPlansTable)
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.clinicId, clinicId)))
      .limit(1);

    if (!plan) return null;

    const allowedStatuses: TreatmentPlanStatus[] = ["draft", "in_progress"];
    if (!allowedStatuses.includes(plan.status)) return this._getPlanWithItems(planId, clinicId);

    return this.updatePlan(planId, clinicId, { status: "approved" });
  }

  async addItem(
    planId: string,
    clinicId: string,
    patientId: string,
    item: { toothFdi?: number; condition?: string; mkb10Code?: string; title: string; price: number },
    sortOrder: number,
  ): Promise<TreatmentPlanItem> {
    const [plan] = await db
      .select()
      .from(treatmentPlansTable)
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.clinicId, clinicId)))
      .limit(1);

    if (!plan) throw new Error("Plan not found");
    if (plan.status !== "draft") throw new PlanLockedError();

    const [created] = await db
      .insert(treatmentPlanItemsTable)
      .values({
        id: randomUUID(),
        planId,
        clinicId,
        patientId,
        toothFdi: item.toothFdi ?? null,
        condition: (item.condition ?? null) as ToothCondition | null,
        mkb10Code: item.mkb10Code ?? null,
        title: item.title,
        price: item.price,
        status: "pending",
        sortOrder,
        procedureId: null,
        createdAt: new Date(),
      })
      .returning();

    await this._recalcTotalCost(planId, clinicId);

    return created!;
  }

  async updateItem(
    itemId: string,
    clinicId: string,
    updates: { title?: string; price?: number; sortOrder?: number; status?: TreatmentPlanItemStatus },
  ): Promise<TreatmentPlanItem | null> {
    const [item] = await db
      .select()
      .from(treatmentPlanItemsTable)
      .where(and(eq(treatmentPlanItemsTable.id, itemId), eq(treatmentPlanItemsTable.clinicId, clinicId)))
      .limit(1);

    if (!item) return null;

    const isStructuralChange =
      updates.title !== undefined ||
      updates.price !== undefined ||
      updates.sortOrder !== undefined;

    if (isStructuralChange) {
      const [plan] = await db
        .select()
        .from(treatmentPlansTable)
        .where(eq(treatmentPlansTable.id, item.planId))
        .limit(1);

      if (!plan || plan.status !== "draft") throw new PlanLockedError();
    }

    const [updated] = await db
      .update(treatmentPlanItemsTable)
      .set(updates)
      .where(and(eq(treatmentPlanItemsTable.id, itemId), eq(treatmentPlanItemsTable.clinicId, clinicId)))
      .returning();

    if (updated && (updates.price !== undefined)) {
      await this._recalcTotalCost(updated.planId, clinicId);
    }

    return updated ?? null;
  }

  async completeItem(
    itemId: string,
    clinicId: string,
    doctorId: string,
  ): Promise<{ item: TreatmentPlanItem; procedureId: string } | null> {
    return db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(treatmentPlanItemsTable)
        .where(and(eq(treatmentPlanItemsTable.id, itemId), eq(treatmentPlanItemsTable.clinicId, clinicId)))
        .limit(1);

      if (!item) return null;

      if (item.status !== "pending") {
        throw new ItemAlreadyCompletedError();
      }

      const procedureId = randomUUID();
      await tx.insert(proceduresTable).values({
        id: procedureId,
        clinicId,
        patientId: item.patientId,
        doctorId,
        name: item.title,
        status: "completed",
        price: item.price,
        notes: item.mkb10Code ? `МКБ-10: ${item.mkb10Code}` : null,
        paymentMethod: "cash",
        scheduledAt: new Date(),
        completedAt: new Date(),
        createdAt: new Date(),
      });

      if (item.toothFdi) {
        const toothTreatmentId = randomUUID();
        await tx.insert(toothTreatmentsTable).values({
          id: toothTreatmentId,
          clinicId,
          patientId: item.patientId,
          toothFdi: item.toothFdi,
          itemId: null,
          description: item.title,
          type: "treatment",
          status: "done",
          quantityUsed: 1,
          performedBy: doctorId,
          performedAt: new Date(),
        });

        const [existingTooth] = await tx
          .select()
          .from(toothRecordsTable)
          .where(
            and(
              eq(toothRecordsTable.patientId, item.patientId),
              eq(toothRecordsTable.clinicId, clinicId),
              eq(toothRecordsTable.toothFdi, item.toothFdi),
            ),
          )
          .limit(1);

        const toothCondition = item.condition;
        const newCondition: ToothCondition =
          toothCondition === "extraction_needed" ? "missing" : "treated";

        if (existingTooth) {
          if (existingTooth.condition !== "treated" && existingTooth.condition !== "missing" && existingTooth.condition !== "healthy") {
            await tx
              .update(toothRecordsTable)
              .set({ condition: newCondition, updatedBy: doctorId, updatedAt: new Date() })
              .where(eq(toothRecordsTable.id, existingTooth.id));
          }
        } else {
          await tx.insert(toothRecordsTable).values({
            id: randomUUID(),
            clinicId,
            patientId: item.patientId,
            toothFdi: item.toothFdi,
            condition: newCondition,
            notes: null,
            updatedBy: doctorId,
            updatedAt: new Date(),
          });
        }
      }

      const [updatedItem] = await tx
        .update(treatmentPlanItemsTable)
        .set({ status: "completed", procedureId })
        .where(eq(treatmentPlanItemsTable.id, itemId))
        .returning();

      const allItems = await tx
        .select()
        .from(treatmentPlanItemsTable)
        .where(eq(treatmentPlanItemsTable.planId, item.planId));

      const allCompleted = allItems.every(
        (i) => i.status === "completed" || i.status === "cancelled",
      );

      await tx
        .update(treatmentPlansTable)
        .set({
          status: allCompleted ? "completed" : "in_progress",
          updatedAt: new Date(),
        })
        .where(eq(treatmentPlansTable.id, item.planId));

      return { item: updatedItem!, procedureId };
    });
  }

  private async _recalcTotalCost(planId: string, clinicId: string): Promise<void> {
    const items = await db
      .select()
      .from(treatmentPlanItemsTable)
      .where(
        and(
          eq(treatmentPlanItemsTable.planId, planId),
          ne(treatmentPlanItemsTable.status, "cancelled"),
        ),
      );
    const totalCost = items.reduce((sum, i) => sum + (i.price ?? 0), 0);
    await db
      .update(treatmentPlansTable)
      .set({ totalCost, updatedAt: new Date() })
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.clinicId, clinicId)));
  }
}
