import { Router, type Request, type Response } from "express";
import { db, clinicsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { parseGreenApiWebhook } from "../shared/green-api";
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
      .select({ greenApiInstanceId: clinicsTable.greenApiInstanceId })
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
