import { db, errorEventsTable, platformAdminsTable } from "@workspace/db";
import type { ErrorEvent } from "@workspace/db";
import { and, count, eq, gte } from "drizzle-orm";
import { logger } from "../../lib/logger";
import type { CaptureErrorInput } from "./error-events.service";
import {
  canSendWithinHourlyCap,
  formatAlert,
  readTelegramDedupMinutes,
  readTelegramMaxPerHour,
  recordTelegramSend,
  shouldNotifyTelegram,
} from "./error-events.policy";

async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
}

async function isFirstFingerprintInWindow(
  fingerprint: string | null,
  dedupMinutes: number,
): Promise<boolean> {
  if (!fingerprint) return true;

  const since = new Date(Date.now() - dedupMinutes * 60 * 1000);
  const [row] = await db
    .select({ total: count() })
    .from(errorEventsTable)
    .where(and(
      eq(errorEventsTable.fingerprint, fingerprint),
      gte(errorEventsTable.createdAt, since),
    ));

  return (row?.total ?? 0) <= 1;
}

export async function notifyAdmins(
  event: ErrorEvent,
  input: CaptureErrorInput,
): Promise<void> {
  if (!shouldNotifyTelegram(input)) return;

  const token = process.env["PLATFORM_TG_BOT_TOKEN"];
  if (!token) {
    logger.debug("[error-events] PLATFORM_TG_BOT_TOKEN not set — skip Telegram alert");
    return;
  }

  const dedupMinutes = readTelegramDedupMinutes();
  if (!(await isFirstFingerprintInWindow(event.fingerprint, dedupMinutes))) {
    logger.debug({ fingerprint: event.fingerprint }, "[error-events] skip Telegram alert — duplicate fingerprint");
    return;
  }

  const maxPerHour = readTelegramMaxPerHour();
  if (!canSendWithinHourlyCap(maxPerHour)) {
    logger.warn(
      { maxPerHour, eventId: event.id },
      "[error-events] skip Telegram alert — hourly cap reached",
    );
    return;
  }

  const admins = await db
    .select({ telegramUserId: platformAdminsTable.telegramUserId })
    .from(platformAdminsTable);

  if (admins.length === 0) {
    logger.debug("[error-events] no platform admins — skip Telegram alert");
    return;
  }

  const text = formatAlert(event);
  const results = await Promise.allSettled(
    admins.map((admin) => sendTelegramMessage(token, admin.telegramUserId, text)),
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    logger.warn({ failed, total: admins.length }, "[error-events] some admin Telegram alerts failed");
    return;
  }

  recordTelegramSend();
  logger.info({ admins: admins.length, eventId: event.id }, "[error-events] Telegram alert sent");
}

/** @deprecated Use notifyAdmins */
export const notifyAdminsIfCritical = notifyAdmins;

/** @deprecated All errors are notified when ERROR_TELEGRAM_NOTIFY=all */
export function isCriticalError(_input: CaptureErrorInput): boolean {
  return true;
}

export {
  shouldNotifyTelegram,
  formatAlert,
  canSendWithinHourlyCap,
  resetTelegramHourlyCapForTests,
  recordTelegramSendForTests,
} from "./error-events.policy";
