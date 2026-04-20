import { logger } from "../lib/logger";

const BASE_URL = "https://api.green-api.com";

/** AbortSignal with a timeout — prevents Green API calls from hanging indefinitely */
function greenApiSignal(timeoutMs = 15_000): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export function getServerBaseUrl(): string | null {
  // 1. Explicit override — highest priority
  if (process.env["WEBHOOK_BASE_URL"]) return process.env["WEBHOOK_BASE_URL"];

  // 2. REPLIT_DOMAINS — available in BOTH dev and production deployments.
  //    In production it contains the *.replit.app domain; in dev the *.replit.dev domain.
  //    Prefer the *.replit.app domain (production) when both are present.
  const replitDomains = process.env["REPLIT_DOMAINS"];
  if (replitDomains) {
    const domains = replitDomains.split(",").map((d) => d.trim()).filter(Boolean);
    const prodDomain = domains.find((d) => d.endsWith(".replit.app")) ?? domains[0];
    if (prodDomain) return `https://${prodDomain}`;
  }

  // 3. Legacy dev-only fallback
  if (process.env["REPLIT_DEV_DOMAIN"]) return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  return null;
}

export async function setGreenApiWebhookUrl(
  instanceId: string,
  token: string,
  webhookUrl: string,
): Promise<void> {
  const url = `${BASE_URL}/waInstance${instanceId}/setSettings/${token}`;
  const res = await fetch(url, {
    method: "POST",
    signal: greenApiSignal(),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookUrl,
      outgoingWebhook: "yes",
      incomingWebhook: "yes",
      outgoingAPIMessageWebhook: "yes",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Green API setSettings failed: ${res.status} ${body}`);
  }
}

export interface GreenApiQrResult {
  type: "qrCode" | "alreadyLogged" | "notAuthorized" | string;
  message: string;
}

export interface GreenApiPairingCodeResult {
  status: "ok" | string;
  authorizationCode?: string;
  message?: string;
}

export async function getGreenApiPairingCode(
  instanceId: string,
  token: string,
  phoneNumber: string,
): Promise<GreenApiPairingCodeResult> {
  // Strip non-digits so the user can enter phone in any format
  const digits = phoneNumber.replace(/\D/g, "");
  const url = `${BASE_URL}/waInstance${instanceId}/getAuthorizationCode/${token}`;
  const res = await fetch(url, {
    method: "POST",
    signal: greenApiSignal(),
    headers: { "Content-Type": "application/json" },
    // Green API expects phoneNumber as a number (integer), not a string
    body: JSON.stringify({ phoneNumber: parseInt(digits, 10) }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Green API getAuthorizationCode failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<GreenApiPairingCodeResult>;
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
    signal: greenApiSignal(),
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
  const res = await fetch(url, { signal: greenApiSignal() });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Green API qr failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<GreenApiQrResult>;
}

// In-memory cache for getStateInstance to avoid 429 rate-limit errors.
// TTL of 6 seconds — the frontend polls every 5s so this prevents duplicate upstream calls.
const stateCache = new Map<string, { result: GreenApiStateResult; expiresAt: number }>();

export function clearGreenApiStateCache(instanceId: string): void {
  stateCache.delete(instanceId);
  webhookRegisteredAt.delete(instanceId);
  logger.info({ instanceId }, "Green API state cache cleared");
}

// Throttle webhook re-registration to at most once per 60 seconds per instance
const webhookRegisteredAt = new Map<string, number>();

export function shouldRegisterWebhook(instanceId: string): boolean {
  const lastAt = webhookRegisteredAt.get(instanceId) ?? 0;
  if (Date.now() - lastAt < 60_000) return false;
  webhookRegisteredAt.set(instanceId, Date.now());
  return true;
}

export async function getGreenApiState(
  instanceId: string,
  token: string,
): Promise<GreenApiStateResult> {
  const cacheKey = instanceId;
  const cached = stateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const url = `${BASE_URL}/waInstance${instanceId}/getStateInstance/${token}`;
  const res = await fetch(url, { signal: greenApiSignal(10_000) });

  if (res.status === 429) {
    // Rate-limited — return cached value if we have one, otherwise treat as not authorized
    logger.warn({ instanceId }, "Green API getStateInstance rate-limited (429); returning cached or fallback");
    if (cached) return cached.result;
    return { stateInstance: "notAuthorized" };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Green API getStateInstance failed: ${res.status} ${body}`);
  }

  const result = await res.json() as GreenApiStateResult;
  stateCache.set(cacheKey, { result, expiresAt: Date.now() + 6_000 });
  return result;
}

export interface GreenApiWaSettingsResult {
  wid?: string;
  phoneNumber?: string;
  nameAccount?: string;
  stateInstance?: string;
  // Fields present in some Green API plan tiers:
  phone?: number | string;   // Raw phone number digits
  chatId?: string;           // e.g. "77001234567@c.us"
  deviceId?: string;
}

export async function getGreenApiWaSettings(
  instanceId: string,
  token: string,
): Promise<GreenApiWaSettingsResult | null> {
  const url = `${BASE_URL}/waInstance${instanceId}/getWaSettings/${token}`;
  const res = await fetch(url, { signal: greenApiSignal() });
  if (!res.ok) return null;
  return res.json() as Promise<GreenApiWaSettingsResult>;
}

/**
 * Extract a clean phone number (digits only) from any Green API WaSettings response.
 * Green API uses different field names across plan tiers:
 *   - Business/partner plans: `phone` (number) + `chatId` ("XXXX@c.us")
 *   - Developer plans: `wid` ("XXXX@c.us") + `phoneNumber` (string)
 */
export function extractPhoneFromWaSettings(
  waSettings: GreenApiWaSettingsResult | null | undefined,
): string | null {
  if (!waSettings) return null;

  // Priority 1: wid field (e.g. "77001234567@c.us")
  if (waSettings.wid) {
    const digits = waSettings.wid.replace("@c.us", "").replace(/\D/g, "");
    if (digits) return digits;
  }

  // Priority 2: chatId field (same format as wid)
  if (waSettings.chatId) {
    const digits = waSettings.chatId.replace("@c.us", "").replace(/\D/g, "");
    if (digits) return digits;
  }

  // Priority 3: phone field (numeric, present in business plan responses)
  if (waSettings.phone != null) {
    const digits = String(waSettings.phone).replace(/\D/g, "");
    if (digits) return digits;
  }

  // Priority 4: phoneNumber string field
  if (waSettings.phoneNumber) {
    const digits = String(waSettings.phoneNumber).replace(/\D/g, "");
    if (digits) return digits;
  }

  // Last resort: scan entire JSON for any @c.us identifier
  const raw = JSON.stringify(waSettings);
  const m = raw.match(/"(\d{8,15})@c\.us"/);
  if (m && m[1]) return m[1];

  return null;
}

export async function logoutGreenApiInstance(
  instanceId: string,
  token: string,
): Promise<void> {
  const url = `${BASE_URL}/waInstance${instanceId}/logout/${token}`;
  const signal = AbortSignal.timeout(15_000);
  const res = await fetch(url, { method: "POST", signal });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Green API logout failed: ${res.status} ${body}`);
  }
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
