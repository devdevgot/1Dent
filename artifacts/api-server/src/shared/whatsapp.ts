/**
 * WhatsApp Business Cloud API proxy.
 * All outbound requests use the clinic's WHATSAPP_TOKEN and WHATSAPP_PHONE_ID.
 * Real patient phone numbers never leave the server.
 */

interface SendMessageResult {
  whatsappMessageId: string;
}

interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
}

function getConfig(): WhatsAppConfig {
  const token = process.env["WHATSAPP_TOKEN"];
  const phoneNumberId = process.env["WHATSAPP_PHONE_ID"];
  if (!token || !phoneNumberId) {
    throw new Error(
      "WHATSAPP_TOKEN and WHATSAPP_PHONE_ID environment variables are required",
    );
  }
  return { token, phoneNumberId };
}

export async function sendWhatsAppMessage(
  recipientPhone: string,
  text: string,
): Promise<SendMessageResult> {
  const { token, phoneNumberId } = getConfig();

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: recipientPhone.replace(/\D/g, ""),
    type: "text",
    text: { body: text },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    messages?: Array<{ id: string }>;
  };
  const whatsappMessageId = data.messages?.[0]?.id ?? "";
  return { whatsappMessageId };
}

/**
 * Verify webhook challenge (GET).
 * Meta sends hub.verify_token to compare against WHATSAPP_WEBHOOK_SECRET.
 */
export function verifyWebhook(
  mode: string,
  token: string,
  challenge: string,
): string | null {
  const secret =
    process.env["WHATSAPP_WEBHOOK_SECRET"] ?? process.env["WHATSAPP_TOKEN"];
  if (mode === "subscribe" && token === secret) {
    return challenge;
  }
  return null;
}

/**
 * RED ALERT keywords — Russian and common transliterations.
 */
export const RED_ALERT_KEYWORDS = [
  "боль",
  "болит",
  "боли",
  "болью",
  "болезнь",
  "кровь",
  "кровотечение",
  "кровоточит",
  "кровит",
  "воспаление",
  "воспалился",
  "воспалилось",
  "температура",
  "жар",
  "опухоль",
  "опух",
  "опухло",
  "гной",
  "гноится",
  "отёк",
  "отек",
  "нестерпимо",
  "срочно",
  "скорую",
  "помогите",
  "pain",
  "bleeding",
  "fever",
  "swelling",
];

export function isRedAlert(text: string): boolean {
  const lower = text.toLowerCase();
  return RED_ALERT_KEYWORDS.some((kw) => lower.includes(kw));
}
