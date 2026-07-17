import webpush from "web-push";
import { randomUUID } from "crypto";
import { db, platformPushBroadcastsTable, platformSettingsTable, pushSubscriptionsTable, usersTable } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

export type WebPushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  notificationId?: string;
};

type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

const VAPID_SETTINGS_KEY = "vapid_keys";
const DEFAULT_VAPID_SUBJECT = "mailto:support@1dent.kz";

let cachedConfig: VapidConfig | null = null;
let resolveInFlight: Promise<VapidConfig | null> | null = null;

function getEnvVapidConfig(): VapidConfig | null {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] ?? DEFAULT_VAPID_SUBJECT;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

function parseStoredVapid(value: unknown): VapidConfig | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const publicKey = typeof record.publicKey === "string" ? record.publicKey : null;
  const privateKey = typeof record.privateKey === "string" ? record.privateKey : null;
  if (!publicKey || !privateKey) return null;
  const subject =
    typeof record.subject === "string" && record.subject.length > 0
      ? record.subject
      : DEFAULT_VAPID_SUBJECT;
  return { publicKey, privateKey, subject };
}

function applyVapidConfig(config: VapidConfig): void {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  cachedConfig = config;
}

async function loadStoredVapidConfig(): Promise<VapidConfig | null> {
  const [row] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, VAPID_SETTINGS_KEY))
    .limit(1);
  return parseStoredVapid(row?.value);
}

async function persistVapidConfig(config: VapidConfig): Promise<VapidConfig> {
  await db
    .insert(platformSettingsTable)
    .values({
      key: VAPID_SETTINGS_KEY,
      value: config,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettingsTable.key,
      set: { value: config, updatedAt: new Date() },
    });

  const stored = await loadStoredVapidConfig();
  return stored ?? config;
}

export async function resolveVapidConfig(): Promise<VapidConfig | null> {
  const envConfig = getEnvVapidConfig();
  if (envConfig) {
    applyVapidConfig(envConfig);
    return envConfig;
  }

  if (cachedConfig) return cachedConfig;
  if (resolveInFlight) return resolveInFlight;

  resolveInFlight = (async () => {
    try {
      const stored = await loadStoredVapidConfig();
      if (stored) {
        applyVapidConfig(stored);
        return stored;
      }

      const generated = webpush.generateVAPIDKeys();
      const config: VapidConfig = {
        publicKey: generated.publicKey,
        privateKey: generated.privateKey,
        subject: process.env["VAPID_SUBJECT"] ?? DEFAULT_VAPID_SUBJECT,
      };

      const persisted = await persistVapidConfig(config);
      applyVapidConfig(persisted);
      logger.info("Web Push: auto-generated and persisted VAPID keys");
      return persisted;
    } catch (err) {
      logger.error({ err }, "Web Push: failed to resolve VAPID config");
      return null;
    } finally {
      resolveInFlight = null;
    }
  })();

  return resolveInFlight;
}

async function ensureVapidConfigured(): Promise<boolean> {
  return (await resolveVapidConfig()) !== null;
}

export async function getVapidPublicKey(): Promise<string | null> {
  return (await resolveVapidConfig())?.publicKey ?? null;
}

export async function isWebPushConfigured(): Promise<boolean> {
  return (await resolveVapidConfig()) !== null;
}

async function removeStaleSubscription(id: string): Promise<void> {
  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, id));
}

export async function sendWebPushToSubscription(
  subscription: { endpoint: string; p256dh: string; auth: string; id: string },
  payload: WebPushPayload,
): Promise<boolean> {
  if (!(await ensureVapidConfigured())) return false;

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 },
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await removeStaleSubscription(subscription.id);
    } else {
      logger.warn({ err, endpoint: subscription.endpoint.slice(0, 64) }, "Web push send failed");
    }
    return false;
  }
}

export async function sendWebPushToUser(userId: string, payload: WebPushPayload): Promise<number> {
  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      const ok = await sendWebPushToSubscription(sub, payload);
      if (ok) sent += 1;
    }),
  );
  return sent;
}

export async function sendWebPushToUsers(userIds: string[], payload: WebPushPayload): Promise<number> {
  if (userIds.length === 0) return 0;
  const uniqueIds = [...new Set(userIds)];

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(inArray(pushSubscriptionsTable.userId, uniqueIds));

  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      const ok = await sendWebPushToSubscription(sub, payload);
      if (ok) sent += 1;
    }),
  );
  return sent;
}

export async function sendWebPushToClinicRoles(
  clinicId: string,
  roles: string[],
  payload: WebPushPayload,
): Promise<number> {
  const subs = await db
    .select({
      id: pushSubscriptionsTable.id,
      endpoint: pushSubscriptionsTable.endpoint,
      p256dh: pushSubscriptionsTable.p256dh,
      auth: pushSubscriptionsTable.auth,
      userId: pushSubscriptionsTable.userId,
    })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.clinicId, clinicId));

  if (subs.length === 0) return 0;

  const users = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(and(eq(usersTable.clinicId, clinicId), inArray(usersTable.role, roles as never[])));

  const allowed = new Set(users.map((u) => u.id));
  let sent = 0;
  await Promise.all(
    subs
      .filter((sub) => allowed.has(sub.userId))
      .map(async (sub) => {
        const ok = await sendWebPushToSubscription(sub, payload);
        if (ok) sent += 1;
      }),
  );
  return sent;
}

export function buildTrackingPushPayload(input: {
  userName: string;
  branchName: string;
  eventType: "checkin" | "checkout";
  timeStr: string;
}): WebPushPayload {
  const emoji = input.eventType === "checkin" ? "✅" : "🚪";
  const verb = input.eventType === "checkin" ? "пришёл в" : "ушёл из";
  return {
    title: "Трекинг",
    body: `${emoji} ${input.userName} ${verb} ${input.branchName} — ${input.timeStr}`,
    url: "/branches",
    tag: "1dent-tracking",
  };
}

export function buildTestTrackingPushPayload(): WebPushPayload {
  return {
    title: "Трекинг",
    body: "✅ Тестовое push-уведомление: трекинг сотрудников работает",
    url: "/branches",
    tag: "1dent-tracking-test",
  };
}

export function buildTestNotificationPushPayload(): WebPushPayload {
  return {
    title: "Тестовое уведомление",
    body: "Push-оповещения CRM работают",
    url: "/",
    tag: "1dent-notification-test",
  };
}

export async function upsertPushSubscription(input: {
  userId: string;
  clinicId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  const existing = await db
    .select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.userId, input.userId),
        eq(pushSubscriptionsTable.endpoint, input.endpoint),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(pushSubscriptionsTable)
      .set({
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        clinicId: input.clinicId,
      })
      .where(eq(pushSubscriptionsTable.id, existing[0].id));
    return;
  }

  await db.insert(pushSubscriptionsTable).values({
    id: randomUUID(),
    userId: input.userId,
    clinicId: input.clinicId,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    userAgent: input.userAgent ?? null,
  });
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.userId, userId),
        eq(pushSubscriptionsTable.endpoint, endpoint),
      ),
    );
}

export async function deleteAllPushSubscriptions(userId: string): Promise<void> {
  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
}

export async function getPushBroadcastStats(clinicId?: string): Promise<{
  devices: number;
  users: number;
  clinics: number;
}> {
  const rows = await db
    .select({
      userId: pushSubscriptionsTable.userId,
      clinicId: pushSubscriptionsTable.clinicId,
    })
    .from(pushSubscriptionsTable)
    .where(clinicId ? eq(pushSubscriptionsTable.clinicId, clinicId) : undefined);

  return {
    devices: rows.length,
    users: new Set(rows.map((r) => r.userId)).size,
    clinics: new Set(rows.map((r) => r.clinicId)).size,
  };
}

export async function executePushBroadcast(input: {
  title: string;
  body: string;
  url?: string;
  clinicId?: string;
  createdByTgId?: string;
  createdByName?: string;
}): Promise<{ id: string; sent: number; failed: number; total: number }> {
  if (!(await resolveVapidConfig())) {
    throw new Error("Push-уведомления не настроены на сервере (VAPID ключи)");
  }

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(input.clinicId ? eq(pushSubscriptionsTable.clinicId, input.clinicId) : undefined);

  const payload: WebPushPayload = {
    title: input.title,
    body: input.body,
    url: input.url || "/",
    tag: `1dent-broadcast-${Date.now()}`,
  };

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    const ok = await sendWebPushToSubscription(sub, payload);
    if (ok) sent += 1;
    else failed += 1;
  }

  const id = randomUUID();
  await db.insert(platformPushBroadcastsTable).values({
    id,
    title: input.title,
    body: input.body,
    url: input.url || "/",
    clinicId: input.clinicId ?? null,
    status: subs.length === 0 ? "empty" : failed === subs.length ? "failed" : "sent",
    recipientCount: subs.length,
    sentCount: sent,
    failedCount: failed,
    createdByTgId: input.createdByTgId ?? null,
    createdByName: input.createdByName ?? null,
  });

  return { id, sent, failed, total: subs.length };
}

export async function listPushBroadcasts(limit = 30) {
  return db
    .select()
    .from(platformPushBroadcastsTable)
    .orderBy(desc(platformPushBroadcastsTable.createdAt))
    .limit(limit);
}
