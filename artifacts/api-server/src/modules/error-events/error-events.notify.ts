import { db, errorEventsTable, platformAdminsTable } from "@workspace/db";
import type { ErrorEvent } from "@workspace/db";
import { and, count, eq, gte } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { getServerBaseUrl } from "../../shared/green-api";
import type { CaptureErrorInput } from "./error-events.service";

const DEDUP_MINUTES = 15;

const SOURCE_LABELS: Record<string, string> = {
  api: "API",
  "dental-crm": "CRM",
  "tg-admin": "Админка",
  worker: "Worker",
};

export function isCriticalError(input: CaptureErrorInput): boolean {
  const severity = input.severity ?? "error";
  if (severity === "fatal") return true;
  if (severity !== "error") return false;

  if (input.source === "api" || input.source === "worker") return true;

  const code = input.code ?? "";
  if (input.source === "dental-crm" || input.source === "tg-admin") {
    return (
      code === "REACT_BOUNDARY"
      || code === "UNHANDLED_REJECTION"
      || code.startsWith("HTTP_5")
    );
  }

  return false;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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

function formatAlert(event: ErrorEvent): string {
  const tmaBase = getServerBaseUrl();
  const errorsUrl = tmaBase ? `${tmaBase}/tg-admin#/errors` : null;

  const lines = [
    "🚨 <b>Критическая ошибка 1Dent</b>",
    "",
    `<b>Источник:</b> ${escapeHtml(SOURCE_LABELS[event.source] ?? event.source)}`,
    `<b>Уровень:</b> ${escapeHtml(event.severity)}`,
    event.code ? `<b>Код:</b> <code>${escapeHtml(event.code)}</code>` : null,
    `<b>Время:</b> ${new Date(event.createdAt).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`,
    "",
    "<b>Сообщение:</b>",
    escapeHtml(event.message.slice(0, 500)),
  ];

  if (event.url) {
    lines.push("", `<b>URL:</b> <code>${escapeHtml(event.url.slice(0, 200))}</code>`);
  }
  if (event.clinicId) {
    lines.push(`<b>Клиника:</b> <code>${escapeHtml(event.clinicId.slice(0, 8))}…</code>`);
  }
  if (errorsUrl) {
    lines.push("", `<a href="${errorsUrl}">Открыть в панели →</a>`);
  }

  return lines.filter((line): line is string => line != null).join("\n");
}

async function isFirstFingerprintInWindow(fingerprint: string | null): Promise<boolean> {
  if (!fingerprint) return true;

  const since = new Date(Date.now() - DEDUP_MINUTES * 60 * 1000);
  const [row] = await db
    .select({ total: count() })
    .from(errorEventsTable)
    .where(and(
      eq(errorEventsTable.fingerprint, fingerprint),
      gte(errorEventsTable.createdAt, since),
    ));

  return (row?.total ?? 0) <= 1;
}

export async function notifyAdminsIfCritical(
  event: ErrorEvent,
  input: CaptureErrorInput,
): Promise<void> {
  if (!isCriticalError(input)) return;

  const token = process.env["PLATFORM_TG_BOT_TOKEN"];
  if (!token) {
    logger.debug("[error-events] PLATFORM_TG_BOT_TOKEN not set — skip Telegram alert");
    return;
  }

  if (!(await isFirstFingerprintInWindow(event.fingerprint))) {
    logger.debug({ fingerprint: event.fingerprint }, "[error-events] skip Telegram alert — duplicate fingerprint");
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
  } else {
    logger.info({ admins: admins.length, eventId: event.id }, "[error-events] critical error Telegram alert sent");
  }
}
