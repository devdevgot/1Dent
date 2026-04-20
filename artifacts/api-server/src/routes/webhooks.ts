import { Router, type Request, type Response } from "express";
import { db, clinicsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { parseGreenApiWebhook, clearGreenApiStateCache, getGreenApiWaSettings, extractPhoneFromWaSettings } from "../shared/green-api";
import { MessagesService } from "../modules/messages/messages.service";
import { logger } from "../lib/logger";

const router = Router();
const service = new MessagesService();

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
      .select({ greenApiInstanceId: clinicsTable.greenApiInstanceId, greenApiToken: clinicsTable.greenApiToken })
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
          const waSettings = await getGreenApiWaSettings(clinic.greenApiInstanceId, clinic.greenApiToken).catch(() => null);
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
      }
      return;
    }

    const parsed = parseGreenApiWebhook(req.body);
    if (!parsed) {
      logger.info({ clinicId, typeWebhook }, "[GreenAPI Webhook] not an incoming text message, skipped");
      return;
    }

    logger.info({ clinicId, from: parsed.senderPhone, msgId: parsed.messageId }, "[GreenAPI Webhook] inbound message");

    await service
      .handleInboundWebhook(clinicId, parsed.senderPhone, parsed.text, parsed.messageId)
      .catch((err) => logger.error({ err, clinicId }, "[GreenAPI Webhook] handleInboundWebhook error"));
  },
);

export default router;
