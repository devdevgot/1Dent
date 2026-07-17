import type { Notification, NotificationType } from "@workspace/db";
import {
  sendWebPushToUser,
  sendWebPushToUsers,
  type WebPushPayload,
} from "./push-notifications";

function titleForType(type: NotificationType): string {
  switch (type) {
    case "red_alert":
      return "Red Alert";
    case "pending_payment":
      return "Ожидает оплаты";
    case "appointment_reminder":
      return "Напоминание о приёме";
    case "new_message":
      return "Новое сообщение";
    case "system":
      return "Уведомление";
    default:
      return "Уведомление";
  }
}

function payloadKind(payload: Record<string, unknown> | null | undefined): string | undefined {
  const kind = payload?.["kind"];
  return typeof kind === "string" ? kind : undefined;
}

function urlForNotification(notification: Notification): string {
  const patientId =
    notification.patientId ??
    (typeof notification.payload?.["patientId"] === "string"
      ? notification.payload["patientId"]
      : undefined);

  switch (notification.type) {
    case "red_alert":
    case "pending_payment":
      return patientId ? "/patients?view=kanban" : "/patients?view=kanban";
    case "appointment_reminder":
      return patientId ? "/patients?view=kanban" : "/calendar";
    case "new_message":
      return "/chat";
    case "system": {
      const kind = payloadKind(notification.payload ?? undefined);
      if (kind === "tablet_pairing") return "/tablet/link";
      if (kind === "ai_credits_exhausted") return "/ai-credits";
      if (notification.message.includes("оператор") || notification.message.includes("чат-бот")) {
        return "/chatbot";
      }
      if (notification.message.includes("📅") || notification.message.includes("запись")) {
        return "/calendar";
      }
      return "/";
    }
    default:
      return patientId ? "/patients?view=kanban" : "/";
  }
}

export function buildNotificationPushPayload(notification: Notification): WebPushPayload {
  return {
    title: titleForType(notification.type),
    body: notification.message,
    url: urlForNotification(notification),
    tag: `1dent-${notification.type}-${notification.id}`,
    notificationId: notification.id,
  };
}

export async function emitPushForNotification(notification: Notification): Promise<void> {
  void sendWebPushToUser(notification.userId, buildNotificationPushPayload(notification));
}

export async function emitPushForNotifications(notifications: Notification[]): Promise<void> {
  if (notifications.length === 0) return;

  await Promise.all(
    notifications.map(async (notification) => {
      await sendWebPushToUser(notification.userId, buildNotificationPushPayload(notification));
    }),
  );
}

export async function emitPushForUserIds(
  userIds: string[],
  payload: WebPushPayload,
): Promise<void> {
  void sendWebPushToUsers(userIds, payload);
}
