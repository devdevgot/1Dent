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

function getConfig(): WhatsAppConfig | null {
  const token = process.env["WHATSAPP_TOKEN"];
  const phoneNumberId = process.env["WHATSAPP_PHONE_ID"];
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId };
}

export async function sendWhatsAppMessage(
  recipientPhone: string,
  text: string,
): Promise<SendMessageResult> {
  const config = getConfig();
  if (!config) {
    // WhatsApp not configured — message is stored in DB but not delivered
    return { whatsappMessageId: "" };
  }
  const { token, phoneNumberId } = config;

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
 * Verify Meta X-Hub-Signature-256 HMAC signature on inbound webhook payloads.
 * Uses WHATSAPP_APP_SECRET env var. In dev (no secret set) returns true.
 * Returns false and should be rejected with 403 if verification fails in prod.
 */
export async function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
): Promise<boolean> {
  const appSecret = process.env["WHATSAPP_APP_SECRET"];
  const isProd = process.env["NODE_ENV"] === "production";

  if (!appSecret) {
    // Fail-closed in production: require secret to be set
    if (isProd) {
      return false;
    }
    // Dev/test: skip verification when no secret configured
    return true;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }
  const { createHmac, timingSafeEqual } = await import("crypto");
  const expected = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const expectedBuf = Buffer.from(`sha256=${expected}`, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
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
