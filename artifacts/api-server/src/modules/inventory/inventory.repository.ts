import {
  db,
  inventoryItemsTable,
  inventoryStockTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type {
  InventoryItem,
  InventoryStock,
} from "@workspace/db";

export type InventoryItemWithStock = InventoryItem & {
  quantity: number;
  minQuantity: number;
};

export class InventoryRepository {
  async list(clinicId: string): Promise<InventoryItemWithStock[]> {
    const items = await db
      .select()
      .from(inventoryItemsTable)
      .where(
        and(
          eq(inventoryItemsTable.clinicId, clinicId),
          eq(inventoryItemsTable.isActive, true),
        ),
      );

    const stockRows = await db
      .select()
      .from(inventoryStockTable)
      .where(eq(inventoryStockTable.clinicId, clinicId));

    const stockMap = new Map<string, InventoryStock>(
      stockRows.map((s) => [s.itemId, s]),
    );

    return items.map((item) => {
      const stock = stockMap.get(item.id);
      return {
        ...item,
        quantity: stock?.quantity ?? 0,
        minQuantity: stock?.minQuantity ?? 0,
      };
    });
  }

  async findById(id: string, clinicId: string): Promise<InventoryItemWithStock | undefined> {
    const [item] = await db
      .select()
      .from(inventoryItemsTable)
      .where(
        and(
          eq(inventoryItemsTable.id, id),
          eq(inventoryItemsTable.clinicId, clinicId),
        ),
      )
      .limit(1);
    if (!item) return undefined;

    const [stock] = await db
      .select()
      .from(inventoryStockTable)
      .where(
        and(
          eq(inventoryStockTable.itemId, id),
          eq(inventoryStockTable.clinicId, clinicId),
        ),
      )
      .limit(1);

    return { ...item, quantity: stock?.quantity ?? 0, minQuantity: stock?.minQuantity ?? 0 };
  }

  async create(
    data: {
      id: string;
      clinicId: string;
      name: string;
      category?: string;
      unit?: string;
      unitPrice?: number;
    },
    stockData: { id: string; quantity: number; minQuantity: number },
  ): Promise<InventoryItemWithStock> {
    const [item] = await db
      .insert(inventoryItemsTable)
      .values({
        id: data.id,
        clinicId: data.clinicId,
        name: data.name,
        category: (data.category as InventoryItem["category"]) ?? "other",
        unit: data.unit ?? "шт",
        unitPrice: data.unitPrice ?? 0,
      })
      .returning();

    const [stock] = await db
      .insert(inventoryStockTable)
      .values({
        id: stockData.id,
        clinicId: data.clinicId,
        itemId: item!.id,
        quantity: stockData.quantity,
        minQuantity: stockData.minQuantity,
      })
      .returning();

    return { ...item!, quantity: stock!.quantity, minQuantity: stock!.minQuantity };
  }

  async update(
    id: string,
    clinicId: string,
    data: Partial<Pick<InventoryItem, "name" | "category" | "unit" | "unitPrice">>,
    minQuantity?: number,
  ): Promise<InventoryItemWithStock | undefined> {
    const [item] = await db
      .update(inventoryItemsTable)
      .set(data)
      .where(
        and(
          eq(inventoryItemsTable.id, id),
          eq(inventoryItemsTable.clinicId, clinicId),
        ),
      )
      .returning();
    if (!item) return undefined;

    if (minQuantity !== undefined) {
      await db
        .update(inventoryStockTable)
        .set({ minQuantity, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryStockTable.itemId, id),
            eq(inventoryStockTable.clinicId, clinicId),
          ),
        );
    }

    return this.findById(id, clinicId);
  }

  async updateStock(
    id: string,
    clinicId: string,
    quantity: number,
  ): Promise<InventoryItemWithStock | undefined> {
    const existing = await db
      .select()
      .from(inventoryStockTable)
      .where(
        and(
          eq(inventoryStockTable.itemId, id),
          eq(inventoryStockTable.clinicId, clinicId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(inventoryStockTable)
        .set({ quantity, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryStockTable.itemId, id),
            eq(inventoryStockTable.clinicId, clinicId),
          ),
        );
    } else {
      const { randomUUID } = await import("crypto");
      await db.insert(inventoryStockTable).values({
        id: randomUUID(),
        clinicId,
        itemId: id,
        quantity,
        minQuantity: 0,
      });
    }

    return this.findById(id, clinicId);
  }

  async deactivate(id: string, clinicId: string): Promise<void> {
    await db
      .update(inventoryItemsTable)
      .set({ isActive: false })
      .where(
        and(
          eq(inventoryItemsTable.id, id),
          eq(inventoryItemsTable.clinicId, clinicId),
        ),
      );
  }

  async restoreStock(
    clinicId: string,
    materials: { itemId: string; quantity: number }[],
  ): Promise<void> {
    for (const m of materials) {
      const [stock] = await db
        .select()
        .from(inventoryStockTable)
        .where(
          and(
            eq(inventoryStockTable.itemId, m.itemId),
            eq(inventoryStockTable.clinicId, clinicId),
          ),
        )
        .limit(1);

      if (!stock) continue;

      await db
        .update(inventoryStockTable)
        .set({ quantity: stock.quantity + m.quantity, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryStockTable.itemId, m.itemId),
            eq(inventoryStockTable.clinicId, clinicId),
          ),
        );
    }
  }

  async validateMaterials(
    clinicId: string,
    materials: { itemId: string; quantity: number }[],
  ): Promise<void> {
    for (const m of materials) {
      const [stock] = await db
        .select()
        .from(inventoryStockTable)
        .where(
          and(
            eq(inventoryStockTable.itemId, m.itemId),
            eq(inventoryStockTable.clinicId, clinicId),
          ),
        )
        .limit(1);

      if (!stock) {
        throw new Error(`Material ${m.itemId} not found in inventory`);
      }
      if (stock.quantity < m.quantity) {
        throw new Error(
          `Insufficient stock for item ${m.itemId}: required ${m.quantity}, available ${stock.quantity}`,
        );
      }
    }
  }

  async deductMaterials(
    clinicId: string,
    materials: { itemId: string; quantity: number }[],
  ): Promise<void> {
    for (const m of materials) {
      const [stock] = await db
        .select()
        .from(inventoryStockTable)
        .where(
          and(
            eq(inventoryStockTable.itemId, m.itemId),
            eq(inventoryStockTable.clinicId, clinicId),
          ),
        )
        .limit(1);

      if (!stock) {
        throw new Error(`Material ${m.itemId} not found in inventory`);
      }
      if (stock.quantity < m.quantity) {
        throw new Error(
          `Insufficient stock for item ${m.itemId}: required ${m.quantity}, available ${stock.quantity}`,
        );
      }

      await db
        .update(inventoryStockTable)
        .set({ quantity: stock.quantity - m.quantity, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryStockTable.itemId, m.itemId),
            eq(inventoryStockTable.clinicId, clinicId),
          ),
        );
    }
  }
}
