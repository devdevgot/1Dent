import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { clinicBranchesTable, geoEventsTable, clinicsTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export class BranchesRepository {
  async listBranches(clinicId: string) {
    return db
      .select()
      .from(clinicBranchesTable)
      .where(eq(clinicBranchesTable.clinicId, clinicId))
      .orderBy(clinicBranchesTable.createdAt);
  }

  async getBranch(id: string, clinicId: string) {
    const [branch] = await db
      .select()
      .from(clinicBranchesTable)
      .where(and(eq(clinicBranchesTable.id, id), eq(clinicBranchesTable.clinicId, clinicId)))
      .limit(1);
    return branch ?? null;
  }

  async createBranch(clinicId: string, data: {
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
  }) {
    const [branch] = await db
      .insert(clinicBranchesTable)
      .values({ id: randomUUID(), clinicId, ...data })
      .returning();
    return branch!;
  }

  async updateBranch(id: string, clinicId: string, data: {
    name?: string;
    latitude?: number;
    longitude?: number;
    radiusMeters?: number;
  }) {
    const [branch] = await db
      .update(clinicBranchesTable)
      .set(data)
      .where(and(eq(clinicBranchesTable.id, id), eq(clinicBranchesTable.clinicId, clinicId)))
      .returning();
    return branch ?? null;
  }

  async deleteBranch(id: string, clinicId: string) {
    const [deleted] = await db
      .delete(clinicBranchesTable)
      .where(and(eq(clinicBranchesTable.id, id), eq(clinicBranchesTable.clinicId, clinicId)))
      .returning();
    return deleted ?? null;
  }

  async logGeoEvent(data: {
    clinicId: string;
    userId: string;
    branchId: string;
    eventType: "checkin" | "checkout";
  }) {
    const [event] = await db
      .insert(geoEventsTable)
      .values({ id: randomUUID(), ...data })
      .returning();
    return event!;
  }

  async getClinicTelegram(clinicId: string) {
    const [clinic] = await db
      .select({
        telegramBotToken: clinicsTable.telegramBotToken,
        telegramOwnerChatId: clinicsTable.telegramOwnerChatId,
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);
    return clinic ?? null;
  }

  async updateClinicTelegram(clinicId: string, data: {
    telegramBotToken: string | null;
    telegramOwnerChatId: string | null;
  }) {
    const [clinic] = await db
      .update(clinicsTable)
      .set(data)
      .where(eq(clinicsTable.id, clinicId))
      .returning();
    return clinic ?? null;
  }

  async getUserName(userId: string): Promise<string> {
    const [u] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    return u?.name ?? "Сотрудник";
  }
}
