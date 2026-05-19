import {
  db,
  treatmentPlansTable,
  treatmentPlanItemsTable,
  toothRecordsTable,
  toothTreatmentsTable,
  proceduresTable,
  CONDITION_MKB10,
} from "@workspace/db";
import { eq, and, desc, ne, inArray, count } from "drizzle-orm";
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
  cavity: "Лечение кариеса",
  treated: "Повторное лечение",
  crown: "Установка коронки",
  root_canal: "Лечение корневого канала",
  implant: "Имплантация",
  missing: "Нет зуба",
  extraction_needed: "Удаление зуба",
};

/** Logical treatment priority: extractions first, then root canals, then cavities, then crowns, then implants */
const CONDITION_PRIORITY: Record<string, number> = {
  extraction_needed: 1,
  root_canal: 2,
  cavity: 3,
  crown: 4,
  implant: 5,
  treated: 9,
  healthy: 10,
  missing: 10,
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
          ne(treatmentPlansTable.status, "cancelled"),
        ),
      )
      .orderBy(desc(treatmentPlansTable.createdAt))
      .limit(1);

    if (!plan) return null;

    let items = await db
      .select()
      .from(treatmentPlanItemsTable)
      .where(eq(treatmentPlanItemsTable.planId, plan.id))
      .orderBy(treatmentPlanItemsTable.sortOrder, treatmentPlanItemsTable.createdAt);

    const pendingItems = items.filter((item) => item.status === "pending" && item.toothFdi !== null);

    if (pendingItems.length > 0) {
      const doneTreatments = await db
        .select()
        .from(toothTreatmentsTable)
        .where(
          and(
            eq(toothTreatmentsTable.clinicId, clinicId),
            eq(toothTreatmentsTable.patientId, patientId),
            eq(toothTreatmentsTable.status, "done"),
          ),
        );

      const completedItemIds = pendingItems
        .filter((item) =>
          doneTreatments.some(
            (treatment) =>
              treatment.toothFdi === item.toothFdi &&
              treatment.description === item.title,
          ),
        )
        .map((item) => item.id);

      if (completedItemIds.length > 0) {
        await db
          .update(treatmentPlanItemsTable)
          .set({ status: "completed" })
          .where(inArray(treatmentPlanItemsTable.id, completedItemIds));

        items = items.map((item) =>
          completedItemIds.includes(item.id) ? { ...item, status: "completed" as const } : item,
        );

        const allCompleted = items.every(
          (item) => item.status === "completed" || item.status === "cancelled",
        );

        if (allCompleted) {
          const finalItemsByTooth = new Map<number, ToothCondition>();
          for (const item of items) {
            if (!item.toothFdi) continue;
            const finalCondition: ToothCondition = item.condition === "extraction_needed" ? "missing" : "treated";
            finalItemsByTooth.set(item.toothFdi, finalCondition);
          }

          for (const [toothFdi, condition] of finalItemsByTooth) {
            const [existingTooth] = await db
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

            if (existingTooth) {
              await db
                .update(toothRecordsTable)
                .set({ condition, updatedBy: plan.doctorId, updatedAt: new Date() })
                .where(eq(toothRecordsTable.id, existingTooth.id));
            } else {
              await db.insert(toothRecordsTable).values({
                id: randomUUID(),
                clinicId,
                patientId,
                toothFdi,
                condition,
                notes: null,
                updatedBy: plan.doctorId,
                updatedAt: new Date(),
              });
            }
          }

          await db
            .update(treatmentPlansTable)
            .set({ status: "completed", updatedAt: new Date() })
            .where(eq(treatmentPlansTable.id, plan.id));
          return null;
        }
      }
    }

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
      // Calculate next plan number for this patient
      const [{ total }] = await tx
        .select({ total: count() })
        .from(treatmentPlansTable)
        .where(
          and(
            eq(treatmentPlansTable.patientId, patientId),
            eq(treatmentPlansTable.clinicId, clinicId),
          ),
        );
      const planNumber = (Number(total) || 0) + 1;

      // Archive any existing active plans for this patient before creating a new one
      await tx
        .update(treatmentPlansTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(treatmentPlansTable.patientId, patientId),
            eq(treatmentPlansTable.clinicId, clinicId),
            ne(treatmentPlansTable.status, "completed"),
            ne(treatmentPlansTable.status, "cancelled"),
          ),
        );

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

        const problemTeeth = teeth
          .filter((t) => t.condition !== "healthy" && t.condition !== "treated" && t.condition !== "missing")
          .sort((a, b) => {
            const pa = CONDITION_PRIORITY[a.condition as string] ?? 9;
            const pb = CONDITION_PRIORITY[b.condition as string] ?? 9;
            if (pa !== pb) return pa - pb;
            return a.toothFdi - b.toothFdi;
          });

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
          planNumber,
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
    patientId: string,
    updates: { notes?: string | null },
  ): Promise<TreatmentPlanWithItems | null> {
    const [existing] = await db
      .select()
      .from(treatmentPlansTable)
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.clinicId, clinicId)))
      .limit(1);
    if (!existing) return null;
    if (existing.patientId !== patientId) return null;

    await db
      .update(treatmentPlansTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.clinicId, clinicId)));
    return this._getPlanWithItems(planId, clinicId);
  }

  async approvePlan(planId: string, clinicId: string, patientId: string): Promise<TreatmentPlanWithItems | null> {
    const [plan] = await db
      .select()
      .from(treatmentPlansTable)
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.clinicId, clinicId)))
      .limit(1);

    if (!plan) return null;
    if (plan.patientId !== patientId) return null;

    if (plan.status !== "draft") {
      // Only draft plans may be approved; any other status is a no-op (return as-is)
      return this._getPlanWithItems(planId, clinicId);
    }

    await db
      .update(treatmentPlansTable)
      .set({ status: "approved", updatedAt: new Date() })
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.clinicId, clinicId)));
    return this._getPlanWithItems(planId, clinicId);
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
    if (plan.patientId !== patientId) throw new Error("Plan does not belong to patient");
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
    planId: string,
    patientId: string,
    updates: { title?: string; price?: number; sortOrder?: number; status?: "cancelled"; notes?: string | null; attachments?: string[]; assignedDoctorId?: string | null },
  ): Promise<TreatmentPlanItem | null> {
    const [item] = await db
      .select()
      .from(treatmentPlanItemsTable)
      .where(and(eq(treatmentPlanItemsTable.id, itemId), eq(treatmentPlanItemsTable.clinicId, clinicId)))
      .limit(1);

    if (!item) return null;
    if (item.planId !== planId) return null;
    if (item.patientId !== patientId) return null;

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
    planId: string,
    patientId: string,
  ): Promise<{ item: TreatmentPlanItem; procedureId: string } | null> {
    return db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(treatmentPlanItemsTable)
        .where(and(eq(treatmentPlanItemsTable.id, itemId), eq(treatmentPlanItemsTable.clinicId, clinicId)))
        .limit(1);

      if (!item) return null;
      if (item.planId !== planId) return null;
      if (item.patientId !== patientId) return null;

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
        status: "pending_payment",
        price: item.price,
        notes: item.mkb10Code ? `МКБ-10: ${item.mkb10Code}` : null,
        paymentMethod: null,
        scheduledAt: new Date(),
        completedAt: null,
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

      if (allCompleted) {
        const finalItemsByTooth = new Map<number, ToothCondition>();
        for (const planItem of allItems) {
          if (!planItem.toothFdi) continue;
          const finalCondition: ToothCondition = planItem.condition === "extraction_needed" ? "missing" : "treated";
          finalItemsByTooth.set(planItem.toothFdi, finalCondition);
        }

        for (const [toothFdi, condition] of finalItemsByTooth) {
          const [existingTooth] = await tx
            .select()
            .from(toothRecordsTable)
            .where(
              and(
                eq(toothRecordsTable.patientId, item.patientId),
                eq(toothRecordsTable.clinicId, clinicId),
                eq(toothRecordsTable.toothFdi, toothFdi),
              ),
            )
            .limit(1);

          if (existingTooth) {
            await tx
              .update(toothRecordsTable)
              .set({ condition, updatedBy: doctorId, updatedAt: new Date() })
              .where(eq(toothRecordsTable.id, existingTooth.id));
          } else {
            await tx.insert(toothRecordsTable).values({
              id: randomUUID(),
              clinicId,
              patientId: item.patientId,
              toothFdi,
              condition,
              notes: null,
              updatedBy: doctorId,
              updatedAt: new Date(),
            });
          }
        }
      }

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
