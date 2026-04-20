import { randomBytes, randomUUID } from "crypto";
import { db, clinicChannelsTable, channelClicksTable, patientsTable, proceduresTable } from "@workspace/db";
import { eq, and, gte, lte, sql, type SQL } from "drizzle-orm";

function generateRefCode(): string {
  return randomBytes(4).toString("hex");
}

export interface ChannelStat {
  channelId: string;
  channelName: string;
  channelType: string;
  refCode: string;
  clickCount: number;
  patientCount: number;
  consultationCount: number;
  conversionRate: number;
  totalRevenue: number;
}

export interface ClickData {
  id?: string;
  channelId: string;
  clinicId: string;
  ip?: string | null;
  userAgent?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
}

export class ChannelsRepository {
  async list(clinicId: string) {
    return db
      .select()
      .from(clinicChannelsTable)
      .where(eq(clinicChannelsTable.clinicId, clinicId))
      .orderBy(clinicChannelsTable.createdAt);
  }

  async findByRefCode(refCode: string) {
    const [row] = await db
      .select()
      .from(clinicChannelsTable)
      .where(eq(clinicChannelsTable.refCode, refCode))
      .limit(1);
    return row ?? null;
  }

  async create(clinicId: string, name: string, type: string) {
    const id = randomUUID();
    const refCode = generateRefCode();
    const [channel] = await db
      .insert(clinicChannelsTable)
      .values({ id, clinicId, name, type: type as any, refCode })
      .returning();
    return channel!;
  }

  async delete(id: string, clinicId: string): Promise<boolean> {
    const result = await db
      .delete(clinicChannelsTable)
      .where(and(eq(clinicChannelsTable.id, id), eq(clinicChannelsTable.clinicId, clinicId)));
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Record a click on a referral link.
   * Returns the generated click_id (UUID).
   * Non-blocking: caller should fire-and-forget — redirect must not wait on this.
   */
  async createClick(data: ClickData): Promise<string> {
    const id = data.id ?? randomUUID();
    await db.insert(channelClicksTable).values({
      id,
      channelId: data.channelId,
      clinicId: data.clinicId,
      ip: data.ip ?? null,
      userAgent: data.userAgent ?? null,
      utmSource: data.utmSource ?? null,
      utmMedium: data.utmMedium ?? null,
      utmCampaign: data.utmCampaign ?? null,
      utmContent: data.utmContent ?? null,
      utmTerm: data.utmTerm ?? null,
      patientId: null,
    });
    return id;
  }

  /**
   * Link a click record to a patient once the chatbot creates them.
   */
  async linkClickToPatient(clickId: string, patientId: string): Promise<void> {
    await db
      .update(channelClicksTable)
      .set({ patientId })
      .where(eq(channelClicksTable.id, clickId));
  }

  async getChannelStats(clinicId: string, dateFrom?: Date, dateTo?: Date): Promise<ChannelStat[]> {
    const channels = await this.list(clinicId);
    if (channels.length === 0) return [];

    const patientConditions = [eq(patientsTable.clinicId, clinicId)];
    if (dateFrom) patientConditions.push(gte(patientsTable.createdAt, dateFrom));
    if (dateTo) patientConditions.push(lte(patientsTable.createdAt, dateTo));

    const allPatients = await db
      .select({
        id: patientsTable.id,
        source: patientsTable.source,
        status: patientsTable.status,
      })
      .from(patientsTable)
      .where(and(...patientConditions));

    const completedProcs = await db
      .select({
        patientId: proceduresTable.patientId,
        price: proceduresTable.price,
      })
      .from(proceduresTable)
      .where(
        and(
          eq(proceduresTable.clinicId, clinicId),
          eq(proceduresTable.status, "completed"),
        ),
      );

    // Aggregate click counts per channel (respect date filters)
    const clickFilters: SQL[] = [eq(channelClicksTable.clinicId, clinicId)];
    if (dateFrom) clickFilters.push(gte(channelClicksTable.createdAt, dateFrom));
    if (dateTo) clickFilters.push(lte(channelClicksTable.createdAt, dateTo));

    const clickRows = await db
      .select({
        channelId: channelClicksTable.channelId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(channelClicksTable)
      .where(and(...clickFilters))
      .groupBy(channelClicksTable.channelId);

    const clicksByChannel = new Map<string, number>(
      clickRows.map((r) => [r.channelId, r.count]),
    );

    const procByPatient = new Map<string, number>();
    for (const proc of completedProcs) {
      procByPatient.set(
        proc.patientId,
        (procByPatient.get(proc.patientId) ?? 0) + (proc.price ?? 0),
      );
    }

    return channels.map((ch) => {
      const tag = `ref:${ch.refCode}`;
      const channelPatients = allPatients.filter(
        (p) => p.source === tag || p.source === ch.id,
      );
      const consultationCount = channelPatients.filter(
        (p) => p.status !== "new_request",
      ).length;
      const totalRevenue = channelPatients.reduce(
        (acc, p) => acc + (procByPatient.get(p.id) ?? 0),
        0,
      );
      const patientCount = channelPatients.length;
      const conversionRate =
        patientCount > 0 ? Math.round((consultationCount / patientCount) * 100) : 0;

      return {
        channelId: ch.id,
        channelName: ch.name,
        channelType: ch.type,
        refCode: ch.refCode,
        clickCount: clicksByChannel.get(ch.id) ?? 0,
        patientCount,
        consultationCount,
        conversionRate,
        totalRevenue,
      };
    });
  }
}
