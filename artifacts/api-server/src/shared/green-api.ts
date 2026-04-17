import { logger } from "../lib/logger";

const BASE_URL = "https://api.green-api.com";

export interface GreenApiQrResult {
  type: "qrCode" | "alreadyLogged" | "notAuthorized" | string;
  message: string;
}

export interface GreenApiStateResult {
  stateInstance: "authorized" | "notAuthorized" | "yellowCard" | string;
  wid?: string;
}

export interface GreenApiSendResult {
  idMessage: string;
}

export interface ParsedWebhook {
  senderPhone: string;
  text: string;
  messageId: string;
}

export async function sendGreenApiMessage(
  instanceId: string,
  token: string,
  phone: string,
  text: string,
): Promise<GreenApiSendResult> {
  const url = `${BASE_URL}/waInstance${instanceId}/sendMessage/${token}`;
  const chatId = phone.includes("@") ? phone : `${phone}@c.us`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message: text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Green API sendMessage failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<GreenApiSendResult>;
}

export async function getGreenApiQrCode(
  instanceId: string,
  token: string,
): Promise<GreenApiQrResult> {
  const url = `${BASE_URL}/waInstance${instanceId}/qr/${token}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Green API qr failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<GreenApiQrResult>;
}

export async function getGreenApiState(
  instanceId: string,
  token: string,
): Promise<GreenApiStateResult> {
  const url = `${BASE_URL}/waInstance${instanceId}/getStateInstance/${token}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Green API getStateInstance failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<GreenApiStateResult>;
}

export function parseGreenApiWebhook(body: unknown): ParsedWebhook | null {
  try {
    const b = body as Record<string, unknown>;

    if (b["typeWebhook"] !== "incomingMessageReceived") return null;

    const senderData = b["senderData"] as Record<string, unknown> | undefined;
    const messageData = b["messageData"] as Record<string, unknown> | undefined;
    const idMessage = b["idMessage"] as string | undefined;

    if (!senderData || !messageData || !idMessage) return null;

    const sender = senderData["sender"] as string | undefined;
    if (!sender) return null;

    const senderPhone = sender.replace("@c.us", "").replace("@g.us", "");

    const textMessageData = messageData["textMessageData"] as Record<string, unknown> | undefined;
    const text = textMessageData?.["textMessage"] as string | undefined;

    if (!text) return null;

    return { senderPhone, text, messageId: idMessage };
  } catch (err) {
    logger.warn({ err }, "parseGreenApiWebhook: failed to parse");
    return null;
  }
}
