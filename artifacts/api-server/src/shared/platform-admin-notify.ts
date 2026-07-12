import { db, platformAdminsTable } from "@workspace/db";
import { logger } from "../lib/logger";

export interface PlatformAdminSendResult {
  recipients: string[];
  sent: number;
  failed: number;
  errors: string[];
}

export async function getPlatformAdminTelegramIds(): Promise<string[]> {
  const rows = await db
    .select({ telegramUserId: platformAdminsTable.telegramUserId })
    .from(platformAdminsTable);

  const ids = new Set<string>(
    rows.map((row: { telegramUserId: string }) => row.telegramUserId.trim()).filter(Boolean),
  );

  const superAdminId = process.env["PLATFORM_SUPERADMIN_TG_ID"]?.trim();
  if (superAdminId) {
    ids.add(superAdminId);
  }

  return [...ids];
}

export async function sendPlatformAdminTelegramMessage(
  token: string,
  text: string,
  chatIds?: string[],
): Promise<PlatformAdminSendResult> {
  const recipients = chatIds ?? await getPlatformAdminTelegramIds();

  if (recipients.length === 0) {
    logger.debug("[platform-admin-notify] no recipients — skip Telegram message");
    return { recipients: [], sent: 0, failed: 0, errors: ["no_recipients"] };
  }

  const errors: string[] = [];
  let sent = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    recipients.map(async (chatId) => {
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

      const bodyText = await res.text().catch(() => "");
      let description = bodyText;
      try {
        const parsed = JSON.parse(bodyText) as { description?: string };
        if (parsed.description) description = parsed.description;
      } catch {
        // keep raw body
      }

      if (!res.ok) {
        throw new Error(`${res.status}: ${description}`);
      }
    }),
  );

  for (const [index, result] of results.entries()) {
    const chatId = recipients[index]!;
    if (result.status === "fulfilled") {
      sent += 1;
      continue;
    }

    failed += 1;
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    errors.push(`${chatId.slice(0, 4)}***: ${message}`);
    logger.warn(
      { chatId: chatId.slice(0, 4) + "***", err: message },
      "[platform-admin-notify] sendMessage failed",
    );
  }

  if (sent > 0) {
    logger.info({ sent, failed, total: recipients.length }, "[platform-admin-notify] messages sent");
  }

  return { recipients, sent, failed, errors };
}
