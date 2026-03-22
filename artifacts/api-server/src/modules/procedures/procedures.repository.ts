import {
  db,
  proceduresTable,
  procedureTemplatesTable,
  procedureMaterialsTable,
  usersTable,
  inventoryStockTable,
  inventoryItemsTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Procedure, ProcedureTemplate, ProcedureStatus } from "@workspace/db";

export type ProcedureWithDoctor = Procedure & {
  doctorName?: string | null;
};

export class ProceduresRepository {
  async list(clinicId: string, doctorId?: string): Promise<ProcedureWithDoctor[]> {
    const rows = await db
      .select({
        procedure: proceduresTable,
        doctorName: usersTable.name,
      })
      .from(proceduresTable)
      .leftJoin(usersTable, eq(proceduresTable.doctorId, usersTable.id))
      .where(
        doctorId
          ? and(
              eq(proceduresTable.clinicId, clinicId),
              eq(proceduresTable.doctorId, doctorId),
            )
          : eq(proceduresTable.clinicId, clinicId),
      )
      .orderBy(desc(proceduresTable.createdAt));

    return rows.map((r) => ({ ...r.procedure, doctorName: r.doctorName }));
  }

  async findById(id: string, clinicId: string): Promise<ProcedureWithDoctor | undefined> {
    const [row] = await db
      .select({
        procedure: proceduresTable,
        doctorName: usersTable.name,
      })
      .from(proceduresTable)
      .leftJoin(usersTable, eq(proceduresTable.doctorId, usersTable.id))
      .where(and(eq(proceduresTable.id, id), eq(proceduresTable.clinicId, clinicId)))
      .limit(1);

    if (!row) return undefined;
    return { ...row.procedure, doctorName: row.doctorName };
  }

  async create(data: {
    id: string;
    clinicId: string;
    patientId: string;
    doctorId?: string;
    name: string;
    price?: number;
    notes?: string;
    scheduledAt?: Date;
  }): Promise<ProcedureWithDoctor> {
    const [procedure] = await db
      .insert(proceduresTable)
      .values({
        id: data.id,
        clinicId: data.clinicId,
        patientId: data.patientId,
        doctorId: data.doctorId ?? null,
        name: data.name,
        price: data.price ?? 0,
        notes: data.notes ?? null,
        scheduledAt: data.scheduledAt ?? null,
        status: "scheduled",
      })
      .returning();

    return this.findById(procedure!.id, data.clinicId) as Promise<ProcedureWithDoctor>;
  }

  async updateStatus(
    id: string,
    clinicId: string,
    status: ProcedureStatus,
  ): Promise<ProcedureWithDoctor | undefined> {
    const completedAt = status === "completed" ? new Date() : null;
    const [procedure] = await db
      .update(proceduresTable)
      .set({ status, completedAt })
      .where(and(eq(proceduresTable.id, id), eq(proceduresTable.clinicId, clinicId)))
      .returning();

    if (!procedure) return undefined;
    return this.findById(id, clinicId);
  }

  async update(
    id: string,
    clinicId: string,
    data: Partial<Pick<Procedure, "name" | "price" | "notes" | "doctorId" | "scheduledAt">>,
  ): Promise<ProcedureWithDoctor | undefined> {
    const [procedure] = await db
      .update(proceduresTable)
      .set(data)
      .where(and(eq(proceduresTable.id, id), eq(proceduresTable.clinicId, clinicId)))
      .returning();

    if (!procedure) return undefined;
    return this.findById(id, clinicId);
  }

  async delete(id: string, clinicId: string): Promise<void> {
    await db
      .delete(proceduresTable)
      .where(and(eq(proceduresTable.id, id), eq(proceduresTable.clinicId, clinicId)));
  }

  async listTemplates(clinicId: string): Promise<ProcedureTemplate[]> {
    return db
      .select()
      .from(procedureTemplatesTable)
      .where(eq(procedureTemplatesTable.clinicId, clinicId))
      .orderBy(procedureTemplatesTable.name);
  }

  async createTemplate(data: {
    id: string;
    clinicId: string;
    name: string;
    description?: string;
    defaultPrice?: number;
    materials?: string;
  }): Promise<ProcedureTemplate> {
    const [template] = await db
      .insert(procedureTemplatesTable)
      .values({
        id: data.id,
        clinicId: data.clinicId,
        name: data.name,
        description: data.description ?? null,
        defaultPrice: data.defaultPrice ?? 0,
        materials: data.materials ?? "[]",
      })
      .returning();
    return template!;
  }

  async findInventoryItemsByNames(
    names: string[],
    clinicId: string,
  ): Promise<{ id: string; name: string }[]> {
    if (names.length === 0) return [];
    const lowerNames = names.map((n) => n.toLowerCase());
    const items = await db
      .select({ id: inventoryItemsTable.id, name: inventoryItemsTable.name })
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.clinicId, clinicId));
    return items.filter((item) => lowerNames.includes(item.name.toLowerCase()));
  }

  async findTemplateById(id: string, clinicId: string): Promise<ProcedureTemplate | null> {
    const [template] = await db
      .select()
      .from(procedureTemplatesTable)
      .where(
        and(eq(procedureTemplatesTable.id, id), eq(procedureTemplatesTable.clinicId, clinicId)),
      )
      .limit(1);
    return template ?? null;
  }

  async deleteTemplate(id: string, clinicId: string): Promise<void> {
    await db
      .delete(procedureTemplatesTable)
      .where(
        and(eq(procedureTemplatesTable.id, id), eq(procedureTemplatesTable.clinicId, clinicId)),
      );
  }

  async saveProcedureMaterials(
    procedureId: string,
    materials: { itemId: string; quantity: number }[],
  ): Promise<void> {
    if (materials.length === 0) return;
    await db.insert(procedureMaterialsTable).values(
      materials.map((m) => ({
        id: randomUUID(),
        procedureId,
        inventoryItemId: m.itemId,
        quantity: m.quantity,
      })),
    );
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
