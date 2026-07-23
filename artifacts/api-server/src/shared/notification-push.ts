import { db, notificationsTable, type Notification, type NotificationType } from "@workspace/db";
import { and, count, eq } from "drizzle-orm";
import {
  sendWebPushToUser,
  sendWebPushToUsers,
  type WebPushPayload,
} from "./push-notifications";

async function countUnreadForUser(userId: string, clinicId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.clinicId, clinicId),
        eq(notificationsTable.read, false),
      ),
    );
  return Number(row?.count ?? 0);
}

function payloadKind(payload: Record<string, unknown> | null | undefined): string | undefined {
  const kind = payload?.["kind"];
  return typeof kind === "string" ? kind : undefined;
}

function scheduleDayUrl(payload: Record<string, unknown> | null | undefined): string {
  const scheduledAt = payload?.["scheduledAt"];
  if (typeof scheduledAt === "string" && scheduledAt.length >= 10) {
    return `/schedule/${scheduledAt.slice(0, 10)}`;
  }
  return "/schedule";
}

function titleForNotification(notification: Notification): string {
  const kind = payloadKind(notification.payload ?? undefined);
  const type = notification.type as NotificationType;

  switch (kind) {
    case "inbound_chat":
      return "Новое сообщение";
    case "appointment_created":
      return "Новая запись";
    case "appointment_rescheduled":
      return "Запись перенесена";
    case "appointment_cancelled":
      return "Запись отменена";
    case "appointment_reassigned":
      return "Запись переназначена";
    case "pending_payment":
      return "Ожидает оплаты";
    case "payment_received":
      return "Оплата получена";
    case "payment_debt":
      return "Оформлен долг";
    case "payment_overdue":
      return "Просрочена оплата";
    case "patient_stage_changed":
      return "Статус пациента";
    case "landing_lead":
      return "Заявка с сайта";
    case "tablet_pairing":
      return "Планшет ждёт подключения";
    case "tablet_pairing_expired":
      return "Подключение планшета истекло";
    case "ai_diagnosis_ready":
      return "AI-диагноз готов";
    case "treatment_plan_created":
      return "План лечения создан";
    case "treatment_plan_approved":
      return "План лечения утверждён";
    case "treatment_plan_sent":
      return "План лечения отправлен";
    case "review_low":
      return "Низкая оценка";
    case "review_positive":
      return "Новый отзыв";
    case "broadcast_finished":
      return "Рассылка завершена";
    case "broadcast_failed":
      return "Ошибка рассылки";
    case "broadcast_reply":
      return "Ответ на рассылку";
    case "contract_viewed":
      return "Договор просмотрен";
    case "contract_signed":
      return "Договор подписан";
    case "human_takeover":
      return "Нужен оператор";
    case "ai_credits_exhausted":
      return "AI-кредиты закончились";
    case "low_stock":
      return "Низкий остаток";
    default:
      break;
  }

  switch (type) {
    case "red_alert":
      return "Red Alert";
    case "pending_payment":
      return "Ожидает оплаты";
    case "appointment_reminder":
      return notification.payload?.["reminderType"] === "5m"
        ? "Приём через 5 минут"
        : "Напоминание о приёме";
    case "appointment":
      return "Запись";
    case "new_message":
      return "Новое сообщение";
    case "system":
      return "Уведомление";
    default:
      return "Уведомление";
  }
}

function urlForNotification(notification: Notification): string {
  const patientId =
    notification.patientId ??
    (typeof notification.payload?.["patientId"] === "string"
      ? notification.payload["patientId"]
      : undefined);
  const reminderType =
    typeof notification.payload?.["reminderType"] === "string"
      ? notification.payload["reminderType"]
      : undefined;
  const kind = payloadKind(notification.payload ?? undefined);

  switch (kind) {
    case "inbound_chat":
    case "broadcast_reply":
    case "human_takeover":
      return "/chat";
    case "appointment_created":
    case "appointment_rescheduled":
    case "appointment_cancelled":
    case "appointment_reassigned":
      return scheduleDayUrl(notification.payload ?? undefined);
    case "pending_payment":
    case "payment_received":
    case "payment_debt":
    case "payment_overdue":
    case "patient_stage_changed":
    case "review_low":
    case "review_positive":
    case "contract_viewed":
    case "contract_signed":
    case "treatment_plan_created":
    case "treatment_plan_approved":
    case "treatment_plan_sent":
    case "ai_diagnosis_ready":
      return patientId ? "/patients?view=kanban" : "/patients?view=kanban";
    case "tablet_pairing":
    case "tablet_pairing_expired":
      return "/tablet/link";
    case "ai_credits_exhausted":
      return "/ai-credits";
    case "landing_lead":
      return "/";
    case "broadcast_finished":
    case "broadcast_failed":
      return "/chatbot";
    case "low_stock":
      return "/inventory";
    default:
      break;
  }

  switch (notification.type) {
    case "red_alert":
    case "pending_payment":
      return "/patients?view=kanban";
    case "appointment_reminder":
      if (reminderType === "5m") return scheduleDayUrl(notification.payload ?? undefined);
      return patientId ? "/patients?view=kanban" : scheduleDayUrl(notification.payload ?? undefined);
    case "appointment":
      return scheduleDayUrl(notification.payload ?? undefined);
    case "new_message":
      return "/chat";
    case "system": {
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

export function buildNotificationPushPayload(
  notification: Notification,
  unreadCount?: number,
): WebPushPayload {
  return {
    title: titleForNotification(notification),
    body: notification.message,
    url: urlForNotification(notification),
    tag: `1dent-${notification.type}-${payloadKind(notification.payload) ?? "x"}-${notification.patientId ?? notification.id}`,
    notificationId: notification.id,
    ...(typeof unreadCount === "number" ? { unreadCount } : {}),
  };
}

export async function emitPushForNotification(notification: Notification): Promise<void> {
  const unreadCount = await countUnreadForUser(notification.userId, notification.clinicId);
  void sendWebPushToUser(
    notification.userId,
    buildNotificationPushPayload(notification, unreadCount),
  );
}

export async function emitPushForNotifications(notifications: Notification[]): Promise<void> {
  if (notifications.length === 0) return;

  await Promise.all(
    notifications.map(async (notification) => {
      const unreadCount = await countUnreadForUser(notification.userId, notification.clinicId);
      await sendWebPushToUser(
        notification.userId,
        buildNotificationPushPayload(notification, unreadCount),
      );
    }),
  );
}

export async function emitPushForUserIds(
  userIds: string[],
  payload: WebPushPayload,
): Promise<void> {
  void sendWebPushToUsers(userIds, payload);
}
