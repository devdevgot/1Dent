import { sendGreenApiMessage, getGreenApiState } from "./green-api";
import { platformWhatsappService } from "../modules/platform-config/platform-whatsapp.service";
import { logger } from "../lib/logger";

/** Send a system message via the platform 1Dent WhatsApp instance (not clinic). */
export async function sendPlatformWhatsApp(phone: string, text: string): Promise<string> {
  const instance = await platformWhatsappService.getDefaultInstance();
  if (!instance) {
    logger.warn({ phone: phone.slice(0, 5) + "***" }, "sendPlatformWhatsApp: no platform instance configured");
    return "";
  }

  const result = await sendGreenApiMessage(
    instance.greenApiInstanceId,
    instance.greenApiToken,
    phone,
    text,
    instance.greenApiUrl,
  );
  return result.idMessage;
}

export async function isPlatformWhatsAppConfigured(): Promise<boolean> {
  const instance = await platformWhatsappService.getDefaultInstance();
  return !!instance;
}

export async function pingPlatformWhatsAppInstance(instanceId: string): Promise<{
  state: string;
  phone: string | null;
}> {
  const instance = await platformWhatsappService.getInstanceById(instanceId);
  if (!instance) {
    throw new Error("Instance not found");
  }

  const state = await getGreenApiState(
    instance.greenApiInstanceId,
    instance.greenApiToken,
    instance.greenApiUrl,
  );

  let phone: string | null = instance.whatsappPhone ?? null;
  if (state.wid) {
    phone = state.wid.replace("@c.us", "").replace(/\D/g, "") || phone;
  }

  return { state: state.stateInstance, phone };
}
