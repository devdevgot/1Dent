import { randomUUID } from "crypto";
import { db, chatbotMessagesTable, messagesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";

/** Copy chatbot transcript into CRM WhatsApp chat when a contact patient is first linked. */
export async function syncChatbotMessagesToPatient(
  clinicId: string,
  phone: string,
  patientId: string,
): Promise<number> {
  const chatRows = await db
    .select({
      direction: chatbotMessagesTable.direction,
      content: chatbotMessagesTable.content,
      createdAt: chatbotMessagesTable.createdAt,
    })
    .from(chatbotMessagesTable)
    .where(and(eq(chatbotMessagesTable.clinicId, clinicId), eq(chatbotMessagesTable.phone, phone)))
    .orderBy(asc(chatbotMessagesTable.createdAt));

  if (chatRows.length === 0) return 0;

  const existing = await db
    .select({
      direction: messagesTable.direction,
      content: messagesTable.content,
      createdAt: messagesTable.createdAt,
    })
    .from(messagesTable)
    .where(and(eq(messagesTable.clinicId, clinicId), eq(messagesTable.patientId, patientId)));

  const existingKeys = new Set(
    existing.map((row) => `${row.direction}|${row.content}|${row.createdAt.toISOString()}`),
  );

  let inserted = 0;
  for (const row of chatRows) {
    const key = `${row.direction}|${row.content}|${row.createdAt.toISOString()}`;
    if (existingKeys.has(key)) continue;

    await db
      .insert(messagesTable)
      .values({
        id: randomUUID(),
        clinicId,
        patientId,
        direction: row.direction,
        senderId: null,
        content: row.content,
        whatsappMessageId: null,
        isRedAlert: false,
        createdAt: row.createdAt,
      })
      .catch((err) => logger.error({ err, patientId }, "Failed to backfill chatbot message to CRM chat"));

    existingKeys.add(key);
    inserted++;
  }

  if (inserted > 0) {
    logger.info({ clinicId, patientId, phone, inserted }, "Backfilled chatbot messages into CRM WhatsApp chat");
  }

  return inserted;
}

export async function mirrorChatbotMessageToPatient(
  clinicId: string,
  patientId: string,
  direction: "inbound" | "outbound",
  content: string,
): Promise<void> {
  await db
    .insert(messagesTable)
    .values({
      id: randomUUID(),
      clinicId,
      patientId,
      direction,
      senderId: null,
      content,
      whatsappMessageId: null,
      isRedAlert: false,
    })
    .catch((err) => logger.error({ err, patientId }, "Failed to mirror chatbot message to CRM chat"));
}
