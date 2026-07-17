import { db, notificationsTable } from "@workspace/db";
import type { InsertNotification, Notification } from "@workspace/db";
import { emitPushForNotification, emitPushForNotifications } from "./notification-push";

export async function insertNotification(data: InsertNotification): Promise<Notification> {
  const [notification] = await db.insert(notificationsTable).values(data).returning();
  void emitPushForNotification(notification!);
  return notification!;
}

export async function insertNotifications(data: InsertNotification[]): Promise<Notification[]> {
  if (data.length === 0) return [];
  const notifications = await db.insert(notificationsTable).values(data).returning();
  void emitPushForNotifications(notifications);
  return notifications;
}
