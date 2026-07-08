import type { ErrorEvent, ErrorEventSeverity } from "@workspace/db";
import { getTmaUrl } from "../../shared/platform-bot";
import type { CaptureErrorInput } from "./error-events.service";

export type TelegramNotifyMode = "all" | "error_and_fatal" | "fatal_only";

const SOURCE_LABELS: Record<string, string> = {
  api: "API",
  "dental-crm": "CRM",
  "tg-admin": "Админка",
  worker: "Worker",
};

const SEVERITY_LABELS: Record<ErrorEventSeverity, string> = {
  warning: "Предупреждение",
  error: "Ошибка",
  fatal: "Критическая ошибка",
};

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function readTelegramNotifyMode(): TelegramNotifyMode {
  const raw = process.env["ERROR_TELEGRAM_NOTIFY"]?.trim().toLowerCase();
  if (raw === "error_and_fatal" || raw === "fatal_only") return raw;
  return "all";
}

export function readTelegramDedupMinutes(): number {
  return readEnvInt("ERROR_TELEGRAM_DEDUP_MINUTES", 15);
}

export function readTelegramMaxPerHour(): number {
  return readEnvInt("ERROR_TELEGRAM_MAX_PER_HOUR", 60);
}

export function severityForStatus(statusCode: number): ErrorEventSeverity {
  if (statusCode >= 500) return "error";
  return "warning";
}

export function shouldNotifyTelegram(
  input: CaptureErrorInput,
  mode: TelegramNotifyMode = readTelegramNotifyMode(),
): boolean {
  const severity = input.severity ?? "error";
  switch (mode) {
    case "all":
      return true;
    case "error_and_fatal":
      return severity === "error" || severity === "fatal";
    case "fatal_only":
      return severity === "fatal";
    default:
      return true;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatAlert(event: ErrorEvent): string {
  const errorsUrl = `${getTmaUrl().replace(/\/$/, "")}#/errors`;
  const severityLabel = SEVERITY_LABELS[event.severity as ErrorEventSeverity] ?? event.severity;

  const lines = [
    `<b>1Dent — ${escapeHtml(severityLabel)}</b>`,
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
  if (event.method) {
    lines.push(`<b>Метод:</b> <code>${escapeHtml(event.method)}</code>`);
  }
  if (event.clinicId) {
    lines.push(`<b>Клиника:</b> <code>${escapeHtml(event.clinicId.slice(0, 8))}…</code>`);
  }
  if (errorsUrl) {
    lines.push("", `<a href="${errorsUrl}">Открыть в панели</a>`);
  }

  return lines.filter((line): line is string => line != null).join("\n");
}

const sentTimestamps: number[] = [];

export function resetTelegramHourlyCapForTests(): void {
  sentTimestamps.length = 0;
}

export function canSendWithinHourlyCap(maxPerHour: number, now = Date.now()): boolean {
  const hourAgo = now - 3_600_000;
  while (sentTimestamps.length > 0 && sentTimestamps[0]! < hourAgo) {
    sentTimestamps.shift();
  }
  return sentTimestamps.length < maxPerHour;
}

export function recordTelegramSend(now = Date.now()): void {
  sentTimestamps.push(now);
}

export function recordTelegramSendForTests(now = Date.now()): void {
  recordTelegramSend(now);
}
