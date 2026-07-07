import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { clinicBranchesTable, geoEventsTable, clinicsTable, usersTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

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

  async getLastGeoEvent(userId: string, branchId: string) {
    const [event] = await db
      .select()
      .from(geoEventsTable)
      .where(and(eq(geoEventsTable.userId, userId), eq(geoEventsTable.branchId, branchId)))
      .orderBy(desc(geoEventsTable.occurredAt))
      .limit(1);
    return event ?? null;
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
        telegramConnectToken: clinicsTable.telegramConnectToken,
        telegramPlatformChatId: clinicsTable.telegramPlatformChatId,
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);
    return clinic ?? null;
  }

  async updateClinicTelegram(clinicId: string, data: {
    telegramBotToken?: string | null;
    telegramOwnerChatId?: string | null;
    telegramConnectToken?: string | null;
    telegramPlatformChatId?: string | null;
  }) {
    const [clinic] = await db
      .update(clinicsTable)
      .set(data)
      .where(eq(clinicsTable.id, clinicId))
      .returning();
    return clinic ?? null;
  }

  async getClinicByConnectToken(token: string) {
    const [clinic] = await db
      .select()
      .from(clinicsTable)
      .where(eq(clinicsTable.telegramConnectToken, token))
      .limit(1);
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

  async getGeoTracking(clinicId: string, opts: {
    branchId?: string;
    userId?: string;
    dateFrom: Date;
    dateTo: Date;
  }) {
    const conditions = [
      eq(geoEventsTable.clinicId, clinicId),
      gte(geoEventsTable.occurredAt, opts.dateFrom),
      lte(geoEventsTable.occurredAt, opts.dateTo),
      ...(opts.branchId ? [eq(geoEventsTable.branchId, opts.branchId)] : []),
      ...(opts.userId ? [eq(geoEventsTable.userId, opts.userId)] : []),
    ];

    const rows = await db
      .select({
        id: geoEventsTable.id,
        eventType: geoEventsTable.eventType,
        occurredAt: geoEventsTable.occurredAt,
        branchId: geoEventsTable.branchId,
        branchName: clinicBranchesTable.name,
        userId: geoEventsTable.userId,
        userName: usersTable.name,
      })
      .from(geoEventsTable)
      .innerJoin(clinicBranchesTable, eq(geoEventsTable.branchId, clinicBranchesTable.id))
      .innerJoin(usersTable, eq(geoEventsTable.userId, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(geoEventsTable.occurredAt));

    return rows;
  }
}
