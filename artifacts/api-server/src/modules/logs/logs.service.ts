import { db, actionLogsTable } from "@workspace/db";
import { eq, and, gte, lte, desc, count } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface CreateActionLogInput {
  clinicId: string;
  userId?: string;
  actionType: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export interface LogsFilter {
  clinicId: string;
  userId?: string;
  actionType?: string;
  entityType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}

export class LogsService {
  async create(input: CreateActionLogInput): Promise<void> {
    await db.insert(actionLogsTable).values({
      id: randomUUID(),
      clinicId: input.clinicId,
      userId: input.userId,
      actionType: input.actionType,
      entityType: input.entityType,
      entityId: input.entityId,
      details: input.details ? JSON.stringify(input.details) : null,
      ipAddress: input.ipAddress,
    });
  }

  async list(filter: LogsFilter): Promise<{ logs: (typeof actionLogsTable.$inferSelect)[]; total: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 50));
    const offset = (page - 1) * limit;

    const conditions = [eq(actionLogsTable.clinicId, filter.clinicId)];
    if (filter.userId) conditions.push(eq(actionLogsTable.userId, filter.userId));
    if (filter.actionType) conditions.push(eq(actionLogsTable.actionType, filter.actionType));
    if (filter.entityType) conditions.push(eq(actionLogsTable.entityType, filter.entityType));
    if (filter.dateFrom) conditions.push(gte(actionLogsTable.createdAt, filter.dateFrom));
    if (filter.dateTo) conditions.push(lte(actionLogsTable.createdAt, filter.dateTo));

    const where = and(...conditions);

    const [logs, [countRow]] = await Promise.all([
      db
        .select()
        .from(actionLogsTable)
        .where(where)
        .orderBy(desc(actionLogsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(actionLogsTable).where(where),
    ]);

    return { logs, total: countRow?.total ?? 0 };
  }
}

export const logsService = new LogsService();
