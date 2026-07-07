import { logger } from "../lib/logger";

const BASE_URL = "https://api.green-api.com";

/** AbortSignal with a timeout — prevents Green API calls from hanging indefinitely */
function greenApiSignal(timeoutMs = 15_000): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

function trimBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export function getServerBaseUrl(): string | null {
  // 1. Explicit override — highest priority
  if (process.env["WEBHOOK_BASE_URL"]) return trimBaseUrl(process.env["WEBHOOK_BASE_URL"]);

  // 2. Public app domain (custom domain on Railway/Render — must match BotFather Web App domain)
  const publicUrl = process.env["PUBLIC_URL"]?.trim();
  if (publicUrl) return trimBaseUrl(publicUrl);

  const frontendUrl = process.env["FRONTEND_URL"]?.trim();
  if (frontendUrl) return trimBaseUrl(frontendUrl);

  // 3. Railway — *.up.railway.app (fallback when no custom domain env is set)
  const railwayDomain = process.env["RAILWAY_PUBLIC_DOMAIN"];
  if (railwayDomain) return `https://${trimBaseUrl(railwayDomain)}`;

  // 4. Render — set automatically on web services
  const renderUrl = process.env["RENDER_EXTERNAL_URL"];
  if (renderUrl) return trimBaseUrl(renderUrl);

  // 5. REPLIT_DOMAINS — available in BOTH dev and production deployments.
  //    In production it contains the *.replit.app domain; in dev the *.replit.dev domain.
  //    Prefer the *.replit.app domain (production) when both are present.
  const replitDomains = process.env["REPLIT_DOMAINS"];
  if (replitDomains) {
    const domains = replitDomains.split(",").map((d) => d.trim()).filter(Boolean);
    const prodDomain = domains.find((d) => d.endsWith(".replit.app")) ?? domains[0];
    if (prodDomain) return `https://${prodDomain}`;
  }

  // 6. Legacy dev-only fallback
  if (process.env["REPLIT_DEV_DOMAIN"]) return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;

  // 7. Production default for 1Dent
  if (process.env["NODE_ENV"] === "production") return "https://www.1dent.kz";

  return null;
}

/** Resolves the correct base URL for an instance. Partner instances have their own subdomain. */
export function resolveInstanceBaseUrl(apiBaseUrl?: string | null): string {
  return apiBaseUrl ? apiBaseUrl.replace(/\/$/, "") : BASE_URL;
}

export async function setGreenApiWebhookUrl(
  instanceId: string,
  token: string,
  webhookUrl: string,
  apiBaseUrl?: string | null,
): Promise<void> {
  const url = `${resolveInstanceBaseUrl(apiBaseUrl)}/waInstance${instanceId}/setSettings/${token}`;
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
  apiBaseUrl?: string | null,
): Promise<GreenApiPairingCodeResult> {
  // Strip non-digits so the user can enter phone in any format
  const digits = phoneNumber.replace(/\D/g, "");
  const url = `${resolveInstanceBaseUrl(apiBaseUrl)}/waInstance${instanceId}/getAuthorizationCode/${token}`;
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
  /** "inbound" = message from patient; "outbound" = sent from clinic's personal phone */
  direction: "inbound" | "outbound";
  /** For inbound: patient's phone. For outbound: recipient (patient) phone. */
  senderPhone: string;
  text: string;
  messageId: string;
}

/**
 * Show or hide the typing indicator in a WhatsApp chat.
 * Green API: POST /waInstance{id}/showTyping/{token}
 * `participate: true` = start typing, `false` = stop.
 * Fire-and-forget — failures are intentionally ignored so they never block replies.
 */
export async function showGreenApiTyping(
  instanceId: string,
  token: string,
  phone: string,
  participate: boolean,
  apiBaseUrl?: string | null,
): Promise<void> {
  const url = `${resolveInstanceBaseUrl(apiBaseUrl)}/waInstance${instanceId}/showTyping/${token}`;
  const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
  try {
    await fetch(url, {
      method: "POST",
      signal: greenApiSignal(5_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, participate }),
    });
  } catch {
    // Non-critical: typing indicator failure must never block message delivery
  }
}

export async function sendGreenApiFile(
  instanceId: string,
  token: string,
  phone: string,
  file: Buffer,
  fileName: string,
  caption?: string,
  apiBaseUrl?: string | null,
): Promise<GreenApiSendResult> {
  const url = `${resolveInstanceBaseUrl(apiBaseUrl)}/waInstance${instanceId}/sendFileByUpload/${token}`;
  const digitsOnly = phone.replace(/\D/g, "");
  const chatId = phone.includes("@") ? phone : `${digitsOnly}@c.us`;

  const form = new FormData();
  form.append("chatId", chatId);
  form.append("fileName", fileName);
  form.append("file", new Blob([file]), fileName);
  if (caption?.trim()) form.append("caption", caption.trim());

  logger.info({ instanceId, chatId, fileName, bytes: file.length }, "[green-api] sendFileByUpload");

  const res = await fetch(url, {
    method: "POST",
    signal: greenApiSignal(60_000),
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ instanceId, chatId, status: res.status, body }, "[green-api] sendFileByUpload failed");
    throw new Error(`Green API sendFileByUpload failed: ${res.status} ${body}`);
  }

  const result = (await res.json()) as GreenApiSendResult;
  logger.info({ instanceId, chatId, idMessage: result.idMessage }, "[green-api] sendFileByUpload OK");
  return result;
}

export async function sendGreenApiMessage(
  instanceId: string,
  token: string,
  phone: string,
  text: string,
  apiBaseUrl?: string | null,
): Promise<GreenApiSendResult> {
  const url = `${resolveInstanceBaseUrl(apiBaseUrl)}/waInstance${instanceId}/sendMessage/${token}`;
  // Green API requires digits-only phone (no +, spaces, parens, dashes)
  const digitsOnly = phone.replace(/\D/g, "");
  const chatId = phone.includes("@") ? phone : `${digitsOnly}@c.us`;

  logger.info({ instanceId, chatId, textLength: text.length }, "[green-api] sendMessage");

  const res = await fetch(url, {
    method: "POST",
    signal: greenApiSignal(),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message: text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ instanceId, chatId, status: res.status, body }, "[green-api] sendMessage failed");
    throw new Error(`Green API sendMessage failed: ${res.status} ${body}`);
  }

  const result = await res.json() as GreenApiSendResult;
  logger.info({ instanceId, chatId, idMessage: result.idMessage }, "[green-api] sendMessage OK");
  return result;
}

export async function getGreenApiQrCode(
  instanceId: string,
  token: string,
  apiBaseUrl?: string | null,
): Promise<GreenApiQrResult> {
  const url = `${resolveInstanceBaseUrl(apiBaseUrl)}/waInstance${instanceId}/qr/${token}`;
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
  apiBaseUrl?: string | null,
): Promise<GreenApiStateResult> {
  const cacheKey = instanceId;
  const cached = stateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const url = `${resolveInstanceBaseUrl(apiBaseUrl)}/waInstance${instanceId}/getStateInstance/${token}`;
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
  apiBaseUrl?: string | null,
): Promise<GreenApiWaSettingsResult | null> {
  const url = `${resolveInstanceBaseUrl(apiBaseUrl)}/waInstance${instanceId}/getWaSettings/${token}`;
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
  apiBaseUrl?: string | null,
): Promise<void> {
  // Green API: Logout is a GET endpoint (not POST). POSTing returns 404 "Cannot POST".
  // Docs: https://green-api.com/en/docs/api/account/Logout/
  const url = `${resolveInstanceBaseUrl(apiBaseUrl)}/waInstance${instanceId}/logout/${token}`;
  const signal = AbortSignal.timeout(15_000);
  const res = await fetch(url, { method: "GET", signal });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Green API logout failed: ${res.status} ${body}`);
  }
}

/** Returns true if the error message indicates the instance was deleted in Green API */
export function isInstanceDeleted(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("Instance is deleted") || msg.includes("instance is deleted") || msg.includes(": 404");
}

// ─── Partner API ─────────────────────────────────────────────────────────────

export interface PartnerCreateInstanceResult {
  idInstance: number;
  apiTokenInstance: string;
  apiUrl: string;
}

/**
 * Create a new WhatsApp instance via Green API Partner API.
 * Docs: https://green-api.com/docs/partners/createInstance/
 * The instance takes up to 5 minutes to initialize after creation.
 */
export async function createPartnerInstance(partnerToken: string): Promise<PartnerCreateInstanceResult> {
  const url = `${BASE_URL}/partner/createInstance/${partnerToken}`;
  const res = await fetch(url, {
    method: "POST",
    signal: greenApiSignal(180_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const rawText = await res.text().catch(() => "");
  logger.info({ status: res.status, rawBody: rawText }, "Green API createInstance raw response");
  if (!res.ok) {
    throw new Error(`Green API createInstance failed: ${res.status} ${rawText}`);
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error(`Green API createInstance: invalid JSON response: ${rawText}`);
  }
  // Green API sometimes returns HTTP 200 with an error payload: {"code":401,"description":"Unauthorized"}
  if (parsed["code"] && !parsed["idInstance"] && !parsed["instanceId"]) {
    throw new Error(`Green API createInstance error ${parsed["code"]}: ${parsed["description"] ?? rawText}`);
  }
  // Green API may return idInstance or instanceId depending on API version/token type
  const idInstance = (parsed["idInstance"] ?? parsed["instanceId"]) as number | undefined;
  const apiTokenInstance = (parsed["apiTokenInstance"] ?? parsed["token"]) as string | undefined;
  // Partner instances use a per-instance subdomain URL, not the standard api.green-api.com
  const apiUrl = (parsed["apiUrl"] as string | undefined) ?? BASE_URL;
  if (!idInstance || !apiTokenInstance) {
    throw new Error(`Green API createInstance: unexpected response shape: ${rawText}`);
  }
  return { idInstance, apiTokenInstance, apiUrl };
}

/**
 * Delete a partner-provisioned instance via Green API Partner API.
 * Docs: https://green-api.com/docs/partners/deleteInstanceAccount/
 */
export async function deletePartnerInstance(instanceId: string, partnerToken: string): Promise<void> {
  const url = `${BASE_URL}/partner/deleteInstanceAccount/${partnerToken}`;
  const res = await fetch(url, {
    method: "DELETE",
    signal: greenApiSignal(30_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idInstance: parseInt(instanceId, 10) }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Green API deleteInstance failed: ${res.status} ${body}`);
  }
}

export interface PartnerInstance {
  idInstance: number;
  apiTokenInstance: string;
  typeInstance?: string;
  stateInstance?: string;
}

/**
 * Get all instances for this partner account.
 * Docs: https://green-api.com/docs/partners/getInstances/
 */
export async function getPartnerInstances(partnerToken: string): Promise<PartnerInstance[]> {
  const url = `${BASE_URL}/partner/getInstances/${partnerToken}`;
  const res = await fetch(url, { signal: greenApiSignal(30_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Green API getInstances failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<PartnerInstance[]>;
}

export function parseGreenApiWebhook(body: unknown): ParsedWebhook | null {
  try {
    const b = body as Record<string, unknown>;
    const typeWebhook = b["typeWebhook"] as string | undefined;

    const senderData = b["senderData"] as Record<string, unknown> | undefined;
    const messageData = b["messageData"] as Record<string, unknown> | undefined;
    const idMessage = b["idMessage"] as string | undefined;

    if (!senderData || !messageData || !idMessage) return null;

    // textMessageData — plain text messages
    const textMessageData = messageData["textMessageData"] as Record<string, unknown> | undefined;
    // extendedTextMessageData — text messages with link previews
    const extendedMessageData = messageData["extendedTextMessageData"] as Record<string, unknown> | undefined;

    const text =
      (textMessageData?.["textMessage"] as string | undefined) ||
      (extendedMessageData?.["text"] as string | undefined) ||
      undefined;

    if (!text) return null;

    // ── Inbound: message from patient ────────────────────────────────────────
    if (typeWebhook === "incomingMessageReceived") {
      const sender = senderData["sender"] as string | undefined;
      if (!sender) return null;
      const senderPhone = sender.replace("@c.us", "").replace("@g.us", "");
      return { direction: "inbound", senderPhone, text, messageId: idMessage };
    }

    // ── Outbound: sent from the clinic's connected phone (not via API) ───────
    // "outgoingMessageReceived" = typed & sent manually on the device
    // "outgoingAPIMessageReceived" = sent via Green API (already saved by CRM — skip)
    if (typeWebhook === "outgoingMessageReceived") {
      // chatId is the RECIPIENT (patient) phone
      const chatId = senderData["chatId"] as string | undefined;
      if (!chatId) return null;
      const recipientPhone = chatId.replace("@c.us", "").replace("@g.us", "");
      return { direction: "outbound", senderPhone: recipientPhone, text, messageId: idMessage };
    }

    return null;
  } catch (err) {
    logger.warn({ err }, "parseGreenApiWebhook: failed to parse");
    return null;
  }
}
