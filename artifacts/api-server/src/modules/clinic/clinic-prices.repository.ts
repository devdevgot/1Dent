import {
  db,
  clinicConditionPricesTable,
  CONDITION_DEFAULT_PRICES,
  CONDITION_MKB10,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { ToothCondition } from "@workspace/db";

export type ConditionPriceEntry = { price: number; mkb10: string };
export type ConditionPricesMap = Record<string, ConditionPriceEntry>;

export type UpdateConditionPriceItem = {
  price: number;
  mkb10Code?: string;
};

const ALL_CONDITIONS: ToothCondition[] = [
  "healthy",
  "cavity",
  "treated",
  "crown",
  "root_canal",
  "implant",
  "missing",
  "extraction_needed",
];

export class ClinicPricesRepository {
  async getConditionPrices(clinicId: string): Promise<ConditionPricesMap> {
    const overrides = await db
      .select()
      .from(clinicConditionPricesTable)
      .where(eq(clinicConditionPricesTable.clinicId, clinicId));

    const overrideMap = new Map(
      overrides.map((r) => [r.condition, { price: r.price, mkb10Code: r.mkb10Code }]),
    );

    const result: ConditionPricesMap = {};
    for (const cond of ALL_CONDITIONS) {
      const row = overrideMap.get(cond);
      const price = row ? row.price : (CONDITION_DEFAULT_PRICES[cond] ?? 0);
      const mkb10 = row?.mkb10Code?.trim() ? row.mkb10Code.trim() : (CONDITION_MKB10[cond] ?? "");
      result[cond] = { price, mkb10 };
    }
    return result;
  }

  async updateConditionPrices(
    clinicId: string,
    updates: Record<string, UpdateConditionPriceItem>,
  ): Promise<ConditionPricesMap> {
    await db.transaction(async (tx) => {
      for (const [condition, item] of Object.entries(updates)) {
        if (!ALL_CONDITIONS.includes(condition as ToothCondition)) continue;
        const cond = condition as ToothCondition;

        const [existing] = await tx
          .select()
          .from(clinicConditionPricesTable)
          .where(
            and(
              eq(clinicConditionPricesTable.clinicId, clinicId),
              eq(clinicConditionPricesTable.condition, cond),
            ),
          )
          .limit(1);

        const mkb10Code =
          item.mkb10Code !== undefined
            ? (item.mkb10Code.trim() || null)
            : undefined;

        if (existing) {
          await tx
            .update(clinicConditionPricesTable)
            .set({
              price: item.price,
              ...(mkb10Code !== undefined ? { mkb10Code } : {}),
              updatedAt: new Date(),
            })
            .where(eq(clinicConditionPricesTable.id, existing.id));
        } else {
          await tx.insert(clinicConditionPricesTable).values({
            id: randomUUID(),
            clinicId,
            condition: cond,
            price: item.price,
            mkb10Code: mkb10Code ?? CONDITION_MKB10[cond] ?? null,
            updatedAt: new Date(),
          });
        }
      }
    });

    return this.getConditionPrices(clinicId);
  }
}
