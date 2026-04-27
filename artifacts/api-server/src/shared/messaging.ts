import { db, clinicsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendGreenApiMessage } from "./green-api";
import { sendWhatsAppMessage } from "./whatsapp";
import { logger } from "../lib/logger";

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

export function isWhatsAppEnabled(): boolean {
  return META_ENABLED;
}
