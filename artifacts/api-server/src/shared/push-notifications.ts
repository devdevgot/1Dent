import webpush from "web-push";
import { randomUUID } from "crypto";
import { db, pushSubscriptionsTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

export type WebPushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  notificationId?: string;
};

function getVapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] ?? "mailto:support@1dent.kz";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  const config = getVapidConfig();
  if (!config) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    vapidConfigured = true;
  }
  return true;
}

export function getVapidPublicKey(): string | null {
  return getVapidConfig()?.publicKey ?? null;
}

export function isWebPushConfigured(): boolean {
  return getVapidConfig() !== null;
}

async function removeStaleSubscription(id: string): Promise<void> {
  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, id));
}

export async function sendWebPushToSubscription(
  subscription: { endpoint: string; p256dh: string; auth: string; id: string },
  payload: WebPushPayload,
): Promise<boolean> {
  if (!ensureVapidConfigured()) return false;

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
    title: "1Dent · Трекинг",
    body: `${emoji} ${input.userName} ${verb} ${input.branchName} — ${input.timeStr}`,
    url: "/branches",
    tag: "1dent-tracking",
  };
}

export function buildTestTrackingPushPayload(): WebPushPayload {
  return {
    title: "1Dent · Трекинг",
    body: "✅ Тестовое push-уведомление: трекинг сотрудников работает",
    url: "/branches",
    tag: "1dent-tracking-test",
  };
}

export function buildTestNotificationPushPayload(): WebPushPayload {
  return {
    title: "1Dent",
    body: "Тестовое push-уведомление: оповещения CRM работают",
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
