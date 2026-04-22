import {
  db,
  proceduresTable,
  procedureTemplatesTable,
  procedureMaterialsTable,
  usersTable,
  inventoryItemsTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Procedure, ProcedureTemplate, ProcedureStatus, PaymentMethod } from "@workspace/db";

export interface ProcedureMaterialItem {
  itemId: string;
  itemName: string;
  unit: string | null;
  quantity: number;
}

export type ProcedureWithDoctor = Procedure & {
  doctorName?: string | null;
  materials?: ProcedureMaterialItem[];
};

export class ProceduresRepository {
  private async fetchMaterials(procedureIds: string[]): Promise<Map<string, ProcedureMaterialItem[]>> {
    if (procedureIds.length === 0) return new Map();
    const rows = await db
      .select({
        procedureId: procedureMaterialsTable.procedureId,
        itemId: procedureMaterialsTable.inventoryItemId,
        itemName: inventoryItemsTable.name,
        unit: inventoryItemsTable.unit,
        quantity: procedureMaterialsTable.quantity,
      })
      .from(procedureMaterialsTable)
      .innerJoin(inventoryItemsTable, eq(procedureMaterialsTable.inventoryItemId, inventoryItemsTable.id))
      .where(inArray(procedureMaterialsTable.procedureId, procedureIds));

    const map = new Map<string, ProcedureMaterialItem[]>();
    for (const r of rows) {
      if (!map.has(r.procedureId)) map.set(r.procedureId, []);
      map.get(r.procedureId)!.push({ itemId: r.itemId, itemName: r.itemName, unit: r.unit, quantity: r.quantity });
    }
    return map;
  }

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

    const procedures = rows.map((r) => ({ ...r.procedure, doctorName: r.doctorName }));
    const ids = procedures.map((p) => p.id);
    const materialsMap = await this.fetchMaterials(ids);
    return procedures.map((p) => ({ ...p, materials: materialsMap.get(p.id) ?? [] }));
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
    notes?: string,
  ): Promise<ProcedureWithDoctor | undefined> {
    const completedAt = status === "completed" ? new Date() : null;
    const updateData: Record<string, unknown> = { status, completedAt };
    if (notes) updateData.notes = notes;

    const [procedure] = await db
      .update(proceduresTable)
      .set(updateData)
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

  async listTemplates(clinicId: string, category?: string): Promise<ProcedureTemplate[]> {
    const where = category && category !== "all"
      ? and(eq(procedureTemplatesTable.clinicId, clinicId), eq(procedureTemplatesTable.category, category))
      : eq(procedureTemplatesTable.clinicId, clinicId);
    return db
      .select()
      .from(procedureTemplatesTable)
      .where(where)
      .orderBy(procedureTemplatesTable.name);
  }

  async createTemplate(data: {
    id: string;
    clinicId: string;
    name: string;
    description?: string;
    defaultPrice?: number;
    materials?: string;
    category?: string;
    code?: string;
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
        category: data.category ?? "other",
        code: data.code ?? null,
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

  async updateTemplate(
    id: string,
    clinicId: string,
    data: Pick<ProcedureTemplate, "defaultPrice">,
  ): Promise<ProcedureTemplate | null> {
    const [template] = await db
      .update(procedureTemplatesTable)
      .set(data)
      .where(and(eq(procedureTemplatesTable.id, id), eq(procedureTemplatesTable.clinicId, clinicId)))
      .returning();
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

  async updatePayment(id: string, clinicId: string, paymentMethod: PaymentMethod): Promise<Procedure | null> {
    const [updated] = await db
      .update(proceduresTable)
      .set({ paymentMethod, status: "completed", completedAt: new Date() })
      .where(and(eq(proceduresTable.id, id), eq(proceduresTable.clinicId, clinicId)))
      .returning();
    return updated ?? null;
  }

}
