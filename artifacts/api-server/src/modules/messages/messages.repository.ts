import { db, messagesTable, notificationsTable, patientsTable } from "@workspace/db";
import type {
  Message,
  InsertMessage,
  Notification,
  InsertNotification,
} from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";

export class MessagesRepository {
  async findPatient(patientId: string, clinicId: string) {
    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(
        and(eq(patientsTable.id, patientId), eq(patientsTable.clinicId, clinicId)),
      );
    return patient ?? null;
  }

  async findPatientByPhone(rawPhone: string, clinicId: string) {
    const all = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.clinicId, clinicId));
    // Normalize: strip all non-digit chars and match suffix
    const digits = rawPhone.replace(/\D/g, "");
    const match = all.find((p) => {
      const pDigits = p.phone.replace(/\D/g, "");
      return pDigits === digits || pDigits.endsWith(digits) || digits.endsWith(pDigits);
    });
    return match ?? null;
  }

  async listByPatient(patientId: string, clinicId: string): Promise<Message[]> {
    return db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.patientId, patientId),
          eq(messagesTable.clinicId, clinicId),
        ),
      )
      .orderBy(asc(messagesTable.createdAt));
  }

  async create(data: InsertMessage): Promise<Message> {
    const [msg] = await db.insert(messagesTable).values(data).returning();
    return msg!;
  }

  async listNotifications(userId: string, clinicId: string): Promise<Notification[]> {
    return db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.clinicId, clinicId),
        ),
      )
      .orderBy(desc(notificationsTable.createdAt));
  }

  async countUnread(userId: string, clinicId: string): Promise<number> {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.clinicId, clinicId),
          eq(notificationsTable.read, false),
        ),
      );
    return rows.length;
  }

  async markNotificationRead(id: string, userId: string, clinicId: string): Promise<Notification | null> {
    const [updated] = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(
        and(
          eq(notificationsTable.id, id),
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.clinicId, clinicId),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async markAllRead(userId: string, clinicId: string): Promise<void> {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.clinicId, clinicId),
          eq(notificationsTable.read, false),
        ),
      );
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const [n] = await db.insert(notificationsTable).values(data).returning();
    return n!;
  }
}
