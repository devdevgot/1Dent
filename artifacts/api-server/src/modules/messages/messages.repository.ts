import { db, messagesTable, notificationsTable, patientsTable } from "@workspace/db";
import type {
  Message,
  InsertMessage,
  Notification,
  InsertNotification,
} from "@workspace/db";
import { eq, and, desc, asc, sql } from "drizzle-orm";

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

  async findPatientByIin(iin: string, clinicId: string) {
    const normalizedIin = iin.replace(/\D/g, "");
    if (normalizedIin.length !== 12) return null;
    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.iin, normalizedIin)))
      .limit(1);
    return patient ?? null;
  }

  async findPatientByPhone(rawPhone: string, clinicId: string) {
    const all = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.clinicId, clinicId));

    // Normalize both sides to digits only for exact comparison.
    // Meta sends phone numbers without "+" and without spaces, e.g. "79001234567".
    // Our DB stores them with "+", spaces, or dashes, e.g. "+7 900 123-45-67".
    // We strip all non-digit chars from both and require an exact match.
    const incomingDigits = rawPhone.replace(/\D/g, "");
    if (incomingDigits.length < 7) return null; // Sanity check: reject suspiciously short numbers

    const matches = all.filter((p) => {
      const storedDigits = p.phone.replace(/\D/g, "");
      return storedDigits === incomingDigits;
    });

    // If multiple patients have the same digit-normalized number (data anomaly),
    // reject to avoid attaching message to the wrong patient.
    if (matches.length !== 1) return null;
    return matches[0] ?? null;
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

  async findByWhatsappMessageId(whatsappMessageId: string, clinicId: string): Promise<Message | null> {
    const [msg] = await db
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.whatsappMessageId, whatsappMessageId), eq(messagesTable.clinicId, clinicId)))
      .limit(1);
    return msg ?? null;
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
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.clinicId, clinicId),
          eq(notificationsTable.read, false),
        ),
      );
    return row?.count ?? 0;
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
