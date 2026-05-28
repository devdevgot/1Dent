import { Router, type Request, type Response } from "express";
import { db, clinicsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { parseGreenApiWebhook, clearGreenApiStateCache, getGreenApiWaSettings, extractPhoneFromWaSettings } from "../shared/green-api";
import { MessagesService } from "../modules/messages/messages.service";
import { BranchesRepository } from "../modules/branches/branches.repository";
import { logger } from "../lib/logger";

const router = Router();
const service = new MessagesService();
const branchesRepo = new BranchesRepository();

// ─── POST /api/webhook/greenapi/:clinicId ─────────────────────────────────────
// Registered BEFORE the main /api router so it is never blocked by the
// router-level authMiddleware applied inside channelsRouter / analyticsRouter.
// Green API calls this with no Bearer token — auth must be completely absent.
router.post(
  "/api/webhook/greenapi/:clinicId",
  async (req: Request, res: Response) => {
    // Always acknowledge quickly so Green API does not retry
    res.status(200).json({ status: "ok" });

    const clinicId = String(req.params["clinicId"]);
    const rawBody = req.body as Record<string, unknown>;
    const typeWebhook = String(rawBody["typeWebhook"] ?? "unknown");

    logger.info({ clinicId, typeWebhook, payload: JSON.stringify(rawBody).slice(0, 300) }, "[GreenAPI Webhook] received");

    const [clinic] = await db
      .select({
        greenApiInstanceId: clinicsTable.greenApiInstanceId,
        greenApiToken: clinicsTable.greenApiToken,
        greenApiUrl: clinicsTable.greenApiUrl,
        whatsappPhone: clinicsTable.whatsappPhone,
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1)
      .catch(() => [undefined]);

    if (!clinic?.greenApiInstanceId) {
      logger.warn({ clinicId }, "[GreenAPI Webhook] clinic not found or no Green API credentials");
      return;
    }

    const payloadInstanceId = String(rawBody["instanceId"] ?? "");
    if (payloadInstanceId && payloadInstanceId !== clinic.greenApiInstanceId) {
      logger.warn({ clinicId, payloadInstanceId, expected: clinic.greenApiInstanceId }, "[GreenAPI Webhook] instanceId mismatch");
      return;
    }

    // ── Handle state change webhooks ────────────────────────────────────────
    // When a QR code is scanned and WhatsApp connects, Green API sends
    // typeWebhook="stateInstanceChanged" with stateInstance="authorized".
    // We must clear the in-memory state cache so the next status poll
    // reflects the new state immediately.
    if (typeWebhook === "stateInstanceChanged") {
      const newState = String(rawBody["stateInstance"] ?? "");
      logger.info({ clinicId, newState }, "[GreenAPI Webhook] state changed");

      // Always clear the cache so the status endpoint re-fetches from Green API
      clearGreenApiStateCache(clinic.greenApiInstanceId);

      if (newState === "authorized") {
        // Try to extract phone from the webhook payload first (some API plans include wid)
        const instanceData = rawBody["instanceData"] as Record<string, unknown> | undefined;
        const widFromPayload = String(instanceData?.["wid"] ?? rawBody["wid"] ?? "").replace("@c.us", "").replace(/\D/g, "");

        let phone: string | null = widFromPayload || null;

        // If not in payload, fetch from getWaSettings
        if (!phone && clinic.greenApiToken) {
          const waSettings = await getGreenApiWaSettings(clinic.greenApiInstanceId, clinic.greenApiToken, clinic.greenApiUrl).catch(() => null);
          phone = extractPhoneFromWaSettings(waSettings);
        }

        if (phone) {
          // Only write phone if not already manually set by the user (whatsapp_phone IS NULL)
          await db.update(clinicsTable)
            .set({ whatsappPhone: phone })
            .where(and(eq(clinicsTable.id, clinicId), isNull(clinicsTable.whatsappPhone)))
            .catch((err) => logger.warn({ err }, "[GreenAPI Webhook] Failed to persist whatsappPhone"));
          logger.info({ clinicId, phone: phone.slice(0, 5) + "***" }, "[GreenAPI Webhook] WhatsApp connected — phone saved (if not already set)");
        } else {
          logger.warn({ clinicId }, "[GreenAPI Webhook] WhatsApp authorized but phone not resolved yet");
        }
      } else if (newState === "notAuthorized") {
        // Green API fires notAuthorized both for genuine user logouts AND for
        // temporary disconnects (phone offline, sleep, brief network drop).
        // Immediately deleting the instance on this signal caused live instances
        // to be wiped during normal reconnect cycles.
        //
        // Safe approach: just clear the in-memory state cache (already done above)
        // so the next status poll reflects the current state and the UI shows
        // "disconnected". Credentials stay in the DB so the status endpoint can
        // still monitor the instance. Cleanup of the partner instance happens in
        // the provision endpoint when the user explicitly re-provisions.
        logger.info({ clinicId }, "[GreenAPI Webhook] WhatsApp notAuthorized — state cache cleared, credentials retained for monitoring");
      }
      return;
    }

    const parsed = parseGreenApiWebhook(req.body);
    if (!parsed) {
      if (typeWebhook === "incomingMessageReceived") {
        // Message was received but is not a plain text message (image, audio, sticker, etc.)
        const messageData = (rawBody["messageData"] as Record<string, unknown> | undefined) ?? {};
        const messageType = String(messageData["typeMessage"] ?? "unknown");
        logger.info({ clinicId, typeWebhook, messageType }, "[GreenAPI Webhook] incomingMessageReceived but not a text message — skipped");
      } else {
        logger.info({ clinicId, typeWebhook }, "[GreenAPI Webhook] non-message webhook type — skipped");
      }
      return;
    }

    logger.info({ clinicId, from: parsed.senderPhone, msgId: parsed.messageId }, "[GreenAPI Webhook] inbound message");

    await service
      .handleInboundWebhook(clinicId, parsed.senderPhone, parsed.text, parsed.messageId)
      .catch((err) => logger.error({ err, clinicId }, "[GreenAPI Webhook] handleInboundWebhook error"));
  },
);

// ─── POST /api/webhook/telegram/platform ─────────────────────────────────────
// Platform bot webhook — receives /start <token> and saves owner's chat_id
router.post("/api/webhook/telegram/platform", async (req: Request, res: Response) => {
  res.status(200).json({ ok: true });

  try {
    const body = req.body as Record<string, unknown>;
    const message = body["message"] as Record<string, unknown> | undefined;
    if (!message) return;

    const chatId = String((message["chat"] as Record<string, unknown>)?.["id"] ?? "");
    const text = String(message["text"] ?? "").trim();
    const firstName = String((message["from"] as Record<string, unknown>)?.["first_name"] ?? "Владелец");

    if (!chatId) return;

    const platformToken = process.env["PLATFORM_TG_BOT_TOKEN"];
    if (!platformToken) return;

    // Handle /start <token>
    if (text.startsWith("/start ")) {
      const connectToken = text.slice(7).trim();
      if (!connectToken) return;

      const clinic = await branchesRepo.getClinicByConnectToken(connectToken);
      if (!clinic) {
        await sendPlatformMessage(platformToken, chatId,
          "❌ Ссылка недействительна или уже использована. Сгенерируйте новую в настройках 1Dent CRM."
        );
        return;
      }

      // Save chat_id and clear the connect token (one-time use)
      await branchesRepo.updateClinicTelegram(clinic.id, {
        telegramPlatformChatId: chatId,
        telegramConnectToken: null,
      });

      await sendPlatformMessage(platformToken, chatId,
        `✅ <b>Telegram подключён!</b>\n\nПривет, ${firstName}! Теперь вы будете получать уведомления от 1Dent CRM о приходе и уходе сотрудников клиники <b>${clinic.name}</b>.`
      );
      logger.info({ clinicId: clinic.id, chatId: chatId.slice(0, 4) + "***" }, "[PlatformBot] clinic connected");
      return;
    }

    // Handle /start without token — just welcome
    if (text === "/start") {
      await sendPlatformMessage(platformToken, chatId,
        "👋 Добро пожаловать в 1Dent CRM!\n\nЧтобы подключить Telegram-уведомления, перейдите в настройки CRM и нажмите «Подключить Telegram»."
      );
    }
  } catch (err) {
    logger.error({ err }, "[PlatformBot] webhook error");
  }
});

async function sendPlatformMessage(token: string, chatId: string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch { /* non-critical */ }
}

export default router;
