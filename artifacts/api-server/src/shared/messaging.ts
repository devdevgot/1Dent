import { db, clinicsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendGreenApiFile, sendGreenApiMessage, showGreenApiTyping } from "./green-api";
import { sendWhatsAppMedia, sendWhatsAppMessage } from "./whatsapp";
import { logger } from "../lib/logger";

export interface OutboundFileAttachment {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  caption?: string;
}

const META_ENABLED = !!(
  process.env["WHATSAPP_TOKEN"] && process.env["WHATSAPP_PHONE_ID"]
);

export async function sendToPatient(
  clinicId: string,
  phone: string,
  text: string,
): Promise<string> {
  const [clinic] = await db
    .select({
      greenApiInstanceId: clinicsTable.greenApiInstanceId,
      greenApiToken: clinicsTable.greenApiToken,
      greenApiUrl: clinicsTable.greenApiUrl,
    })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId))
    .limit(1);

  if (clinic?.greenApiInstanceId && clinic?.greenApiToken) {
    const result = await sendGreenApiMessage(
      clinic.greenApiInstanceId,
      clinic.greenApiToken,
      phone,
      text,
      clinic.greenApiUrl,
    );
    return result.idMessage;
  }

  if (META_ENABLED) {
    const result = await sendWhatsAppMessage(phone, text);
    return result.whatsappMessageId ?? "";
  }

  logger.info({ clinicId, phone }, "sendToPatient: no WhatsApp provider configured — message not delivered");
  return "";
}

export async function sendFileToPatient(
  clinicId: string,
  phone: string,
  attachment: OutboundFileAttachment,
): Promise<string> {
  const [clinic] = await db
    .select({
      greenApiInstanceId: clinicsTable.greenApiInstanceId,
      greenApiToken: clinicsTable.greenApiToken,
      greenApiUrl: clinicsTable.greenApiUrl,
    })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId))
    .limit(1);

  if (clinic?.greenApiInstanceId && clinic?.greenApiToken) {
    const result = await sendGreenApiFile(
      clinic.greenApiInstanceId,
      clinic.greenApiToken,
      phone,
      attachment.buffer,
      attachment.fileName,
      attachment.caption,
      clinic.greenApiUrl,
    );
    return result.idMessage;
  }

  if (META_ENABLED) {
    const result = await sendWhatsAppMedia(
      phone,
      attachment.buffer,
      attachment.contentType,
      attachment.fileName,
      attachment.caption,
    );
    return result.whatsappMessageId ?? "";
  }

  logger.info({ clinicId, phone, fileName: attachment.fileName }, "sendFileToPatient: no WhatsApp provider configured — file not delivered");
  return "";
}

/**
 * Send a typing indicator (or stop it) to a patient's WhatsApp chat.
 * Only works when the clinic uses Green API — silently no-ops otherwise.
 * This is fire-and-forget so it never blocks the caller.
 */
export async function sendTypingToPatient(
  clinicId: string,
  phone: string,
  participate: boolean,
): Promise<void> {
  const [clinic] = await db
    .select({
      greenApiInstanceId: clinicsTable.greenApiInstanceId,
      greenApiToken: clinicsTable.greenApiToken,
      greenApiUrl: clinicsTable.greenApiUrl,
    })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId))
    .limit(1);

  if (clinic?.greenApiInstanceId && clinic?.greenApiToken) {
    await showGreenApiTyping(
      clinic.greenApiInstanceId,
      clinic.greenApiToken,
      phone,
      participate,
      clinic.greenApiUrl,
    );
  }
}

export function isWhatsAppEnabled(): boolean {
  return META_ENABLED;
}
