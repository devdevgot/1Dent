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
import { openrouter, FAST_MODEL, parseLlmJson } from "../../lib/openrouter-client";

export type TreatmentPlanWithItems = TreatmentPlan & { items: TreatmentPlanItem[] };

function conditionToStageId(condition: string): string {
  const map: Record<string, string> = {
    cavity: "prevention_treatment",
    treated: "prevention_treatment",
    root_canal: "prevention_treatment",
    crown: "orthopedics",
    implant: "surgery",
    extraction_needed: "surgery",
    missing: "surgery",
  };
  return map[condition] ?? "other";
}

async function generateAiPlanItems(
  teeth: { toothFdi: number; condition: string; notes: string | null }[],
  pricesMap: ConditionPricesMap,
): Promise<Array<{ toothFdi: number | null; condition: string | null; title: string; price: number; stage: string }>> {
  const systemPrompt = `Ты — искусственный интеллект для планирования стоматологического лечения.
Тебе на вход дается список проблемных зубов пациента с их текущим состоянием (condition) и заметками врача.
Также тебе дается карта цен клиники для каждого состояния зуба.
Твоя задача — составить оптимальный, последовательный план лечения, разделенный на этапы.

Доступные этапы (stage):
1. 'prevention_treatment' (Этап 1. Профилактика и лечение зубов) — включает профессиональную гигиену полости рта (всегда планируй ее самой первой процедурой), лечение кариеса (кариес / терапия), лечение пульпита и периодонтита (каналы).
2. 'surgery' (Этап 2. Хирургия) — включает удаление зубов и имплантацию (установку имплантатов). Должно идти ПОСЛЕ этапа профилактики и лечения.
3. 'orthopedics' (Этап 3. Ортопедическое лечение) — включает установку коронок на зубы или коронки на импланты, протезирование. Идет в конце (ПОСЛЕ хирургии).
4. 'other' — прочее.

Важно соблюдать логический порядок этапов:
1. Сначала профессиональная гигиена, терапия и лечение каналов ('prevention_treatment').
2. Затем удаление и имплантация ('surgery').
3. В конце — протезирование, коронки ('orthopedics').

Для каждого зуба из списка выбери правильную процедуру и цену на основе карты цен клиники:
${JSON.stringify(pricesMap, null, 2)}

Если в карте цен нет специальной цены для конкретного состояния, используй цену по умолчанию (default) или 0.

Выдай ответ строго в формате JSON массива объектов:
[
  {
    "toothFdi": 16,
    "condition": "cavity",
    "title": "Лечение кариеса — зуб #16",
    "price": 15000,
    "stage": "prevention_treatment"
  }
]
Не пиши никакого другого текста вокруг JSON.`;

  const userPrompt = `Список проблемных зубов пациента:
${JSON.stringify(teeth, null, 2)}`;

  try {
    const response = await openrouter.chat.completions.create({
      model: FAST_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content ?? "[]";
    const result = parseLlmJson<any[]>(content);
    if (Array.isArray(result)) {
      return result;
    }
    if (result && typeof result === "object") {
      const keys = Object.keys(result);
      for (const k of keys) {
        if (Array.isArray(result[k])) return result[k];
      }
    }
    return [];
  } catch (err) {
    console.error("[AiTreatmentPlan] LLM call failed:", err);
    return [];
  }
}


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
    const planId = randomUUID();

    const VALID_CONDITIONS = new Set([
      "healthy", "cavity", "treated", "crown", "root_canal",
      "implant", "missing", "extraction_needed",
    ]);

    let itemsData: Array<{
      id: string; planId: string; clinicId: string; patientId: string;
      toothFdi: number | null; condition: ToothCondition | null; mkb10Code: string | null;
      title: string; price: number; status: TreatmentPlanItemStatus; sortOrder: number;
      procedureId: string | null; stage: string | null; createdAt: Date;
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
        stage: null,
        createdAt: new Date(),
      }));
    } else {
      const teeth = await db
        .select()
        .from(toothRecordsTable)
        .where(
          and(
            eq(toothRecordsTable.patientId, patientId),
            eq(toothRecordsTable.clinicId, clinicId),
          ),
        );

      let aiItems: any[] = [];
      try {
        const formattedTeeth = teeth
          .filter((t) => t.condition !== "healthy")
          .map((t) => ({
            toothFdi: t.toothFdi,
            condition: t.condition,
            notes: t.notes,
          }));

        if (formattedTeeth.length > 0) {
          aiItems = await generateAiPlanItems(formattedTeeth, pricesMap);
        }
      } catch (e) {
        console.warn("[AiTreatmentPlan] Failed to generate AI plan, falling back to local:", e);
      }

      if (aiItems.length > 0) {
        itemsData = aiItems
          .filter((item) => item.title && typeof item.title === "string")
          .map((item, idx) => {
            const rawCond = item.condition;
            const cond = rawCond && VALID_CONDITIONS.has(rawCond) ? rawCond : null;
            const priceEntry = cond ? pricesMap[cond] : null;
            return {
              id: randomUUID(),
              planId,
              clinicId,
              patientId,
              toothFdi: typeof item.toothFdi === "number" ? item.toothFdi : null,
              condition: (cond ?? null) as ToothCondition | null,
              mkb10Code: (cond && (priceEntry?.mkb10 ?? CONDITION_MKB10[cond])) ?? null,
              title: item.title,
              price: typeof item.price === "number" ? item.price : (priceEntry?.price ?? 0),
              status: "pending" as TreatmentPlanItemStatus,
              sortOrder: idx,
              procedureId: null,
              stage: item.stage ?? null,
              createdAt: new Date(),
            };
          });
      } else {
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
          const stage = conditionToStageId(cond);
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
            stage,
            createdAt: new Date(),
          };
        });
      }
    }

    const totalCost = itemsData.reduce((sum, i) => sum + i.price, 0);

    return db.transaction(async (tx) => {
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
    updates: { title?: string; price?: number; sortOrder?: number; status?: "cancelled"; notes?: string | null; attachments?: string[]; assignedDoctorId?: string | null; bundleToken?: string | null; stage?: string | null; discount?: number; procedureId?: string | null; scheduledAt?: string | null },
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
      updates.price !== undefined;

    if (isStructuralChange) {
      const [plan] = await db
        .select()
        .from(treatmentPlansTable)
        .where(eq(treatmentPlansTable.id, item.planId))
        .limit(1);

      if (!plan || plan.status !== "draft") throw new PlanLockedError();
    }

    const dbUpdates: Record<string, any> = { ...updates };
    if (updates.scheduledAt !== undefined) {
      dbUpdates.scheduledAt = updates.scheduledAt ? new Date(updates.scheduledAt) : null;
    }

    const [updated] = await db
      .update(treatmentPlanItemsTable)
      .set(dbUpdates)
      .where(and(eq(treatmentPlanItemsTable.id, itemId), eq(treatmentPlanItemsTable.clinicId, clinicId)))
      .returning();

    if (updated && (updates.price !== undefined || updates.discount !== undefined)) {
      await this._recalcTotalCost(updated.planId, clinicId);
    }

    if (updated && updates.scheduledAt !== undefined) {
      await this._syncScheduledProcedure(updated, clinicId);
    }

    return updated ?? null;
  }

  private async _syncScheduledProcedure(item: TreatmentPlanItem, clinicId: string): Promise<void> {
    const doctorId = item.assignedDoctorId ?? null;

    if (item.procedureId) {
      const [existing] = await db
        .select()
        .from(proceduresTable)
        .where(eq(proceduresTable.id, item.procedureId))
        .limit(1);

      if (existing && existing.status === "scheduled") {
        if (item.scheduledAt) {
          await db
            .update(proceduresTable)
            .set({
              scheduledAt: item.scheduledAt,
              doctorId,
              name: item.title,
            })
            .where(eq(proceduresTable.id, item.procedureId));
        } else {
          await db
            .delete(proceduresTable)
            .where(eq(proceduresTable.id, item.procedureId));
          await db
            .update(treatmentPlanItemsTable)
            .set({ procedureId: null })
            .where(eq(treatmentPlanItemsTable.id, item.id));
        }
        return;
      }
    }

    if (!item.scheduledAt) return;

    const procId = randomUUID();
    await db.insert(proceduresTable).values({
      id: procId,
      clinicId,
      patientId: item.patientId,
      doctorId,
      name: item.title,
      status: "scheduled",
      price: 0,
      notes: item.toothFdi ? `Зуб №${item.toothFdi}` : null,
      scheduledAt: item.scheduledAt,
      completedAt: null,
      createdAt: new Date(),
    });

    await db
      .update(treatmentPlanItemsTable)
      .set({ procedureId: procId })
      .where(eq(treatmentPlanItemsTable.id, item.id));
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

      const discount = item.discount ?? 0;
      const finalPrice = discount > 0 ? item.price * (1 - discount / 100) : item.price;

      let procedureId: string;

      if (item.procedureId) {
        const [existingProc] = await tx
          .select()
          .from(proceduresTable)
          .where(eq(proceduresTable.id, item.procedureId))
          .limit(1);

        if (existingProc && (existingProc.status === "scheduled" || existingProc.status === "in_progress")) {
          procedureId = existingProc.id;
          await tx
            .update(proceduresTable)
            .set({
              status: "pending_payment",
              price: finalPrice,
              doctorId,
              notes: item.mkb10Code ? `МКБ-10: ${item.mkb10Code}` : null,
              completedAt: new Date(),
            })
            .where(eq(proceduresTable.id, procedureId));
        } else {
          procedureId = randomUUID();
          await tx.insert(proceduresTable).values({
            id: procedureId,
            clinicId,
            patientId: item.patientId,
            doctorId,
            name: item.title,
            status: "pending_payment",
            price: finalPrice,
            notes: item.mkb10Code ? `МКБ-10: ${item.mkb10Code}` : null,
            paymentMethod: null,
            scheduledAt: new Date(),
            completedAt: null,
            createdAt: new Date(),
          });
        }
      } else {
        procedureId = randomUUID();
        await tx.insert(proceduresTable).values({
          id: procedureId,
          clinicId,
          patientId: item.patientId,
          doctorId,
          name: item.title,
          status: "pending_payment",
          price: finalPrice,
          notes: item.mkb10Code ? `МКБ-10: ${item.mkb10Code}` : null,
          paymentMethod: null,
          scheduledAt: new Date(),
          completedAt: null,
          createdAt: new Date(),
        });
      }

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
    const totalCost = items.reduce((sum, i) => {
      const discount = i.discount ?? 0;
      const discountedPrice = (i.price ?? 0) * (1 - discount / 100);
      return sum + discountedPrice;
    }, 0);
    await db
      .update(treatmentPlansTable)
      .set({ totalCost, updatedAt: new Date() })
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.clinicId, clinicId)));
  }
}
