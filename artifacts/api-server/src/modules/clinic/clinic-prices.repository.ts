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

    const overrideMap = new Map(overrides.map((r) => [r.condition, r.price]));

    const result: ConditionPricesMap = {};
    for (const cond of ALL_CONDITIONS) {
      const price = overrideMap.has(cond)
        ? overrideMap.get(cond)!
        : (CONDITION_DEFAULT_PRICES[cond] ?? 0);
      result[cond] = {
        price,
        mkb10: CONDITION_MKB10[cond] ?? "",
      };
    }
    return result;
  }

  async updateConditionPrices(
    clinicId: string,
    prices: Record<string, number>,
  ): Promise<ConditionPricesMap> {
    await db.transaction(async (tx) => {
      for (const [condition, price] of Object.entries(prices)) {
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

        if (existing) {
          await tx
            .update(clinicConditionPricesTable)
            .set({ price, updatedAt: new Date() })
            .where(eq(clinicConditionPricesTable.id, existing.id));
        } else {
          await tx.insert(clinicConditionPricesTable).values({
            id: randomUUID(),
            clinicId,
            condition: cond,
            price,
            updatedAt: new Date(),
          });
        }
      }
    });

    return this.getConditionPrices(clinicId);
  }
}
