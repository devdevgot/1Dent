import { logger } from "../lib/logger";
import { getServerBaseUrl } from "./green-api";
import { getPublicAppBaseUrl } from "./public-url";

export function getTmaUrl(): string {
  return `${getPublicAppBaseUrl()}/tg-admin/`;
}

export function getPlatformWebhookUrl(): string | null {
  const base = getServerBaseUrl();
  return base ? `${base}/api/webhook/telegram/platform` : null;
}

export async function sendPlatformBotMessage(
  token: string,
  chatId: string,
  text: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...extra,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn({ chatId: chatId.slice(0, 4) + "***", body }, "[PlatformBot] sendMessage failed");
  }
}

export async function sendTmaOpenButton(token: string, chatId: string): Promise<void> {
  const tmaUrl = getTmaUrl();
  await sendPlatformBotMessage(token, chatId, "Откройте панель управления 1Dent:", {
    reply_markup: {
      inline_keyboard: [[{ text: "Панель управления", web_app: { url: tmaUrl } }]],
    },
  });
}

export async function registerPlatformBot(token: string): Promise<void> {
  const webhookBase = getServerBaseUrl();
  if (!webhookBase) {
    logger.warn("[PlatformBot] webhookBase not resolved — set WEBHOOK_BASE_URL or PUBLIC_URL");
    return;
  }

  const webhookUrl = getPlatformWebhookUrl()!;
  const tmaUrl = getTmaUrl();

  const webhookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  })
    .then((r) => r.json())
    .catch((err) => {
      logger.warn({ err }, "[PlatformBot] Failed to register webhook");
      return null;
    });
  if (webhookRes) logger.info({ result: webhookRes, webhookUrl }, "[PlatformBot] Webhook registered");

  const menuRes = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      menu_button: { type: "web_app", text: "Панель управления", web_app: { url: tmaUrl } },
    }),
  })
    .then((r) => r.json())
    .catch((err) => {
      logger.warn({ err }, "[PlatformBot] Failed to set menu button");
      return null;
    });
  if (menuRes) logger.info({ result: menuRes, tmaUrl }, "[PlatformBot] Menu button set");

  const commandsRes = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start", description: "Открыть панель управления" },
        { command: "admin", description: "Информация об администраторе" },
      ],
    }),
  })
    .then((r) => r.json())
    .catch((err) => {
      logger.warn({ err }, "[PlatformBot] Failed to set commands");
      return null;
    });
  if (commandsRes) logger.info({ result: commandsRes }, "[PlatformBot] Commands registered");
}
