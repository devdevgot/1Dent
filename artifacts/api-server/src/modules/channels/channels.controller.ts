import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { ChannelsRepository } from "./channels.repository";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { db, clinicsTable, channelTypes } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getGreenApiQrCode, getGreenApiState, setGreenApiWebhookUrl, getServerBaseUrl, logoutGreenApiInstance, clearGreenApiStateCache, getGreenApiWaSettings, shouldRegisterWebhook } from "../../shared/green-api";
import { logger } from "../../lib/logger";

const router: IRouter = Router();
const repo = new ChannelsRepository();

const ownerAdminRoles = roleGuard("owner", "admin");

const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(channelTypes),
});

router.use(authMiddleware);

router.get(
  "/channels",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const channels = await repo.list(req.user!.clinicId).catch(next);
    if (channels === undefined) return;
    res.json({ success: true, data: { channels } });
  },
);

router.post(
  "/channels",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = createChannelSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));
    const { name, type } = parsed.data;
    const channel = await repo.create(req.user!.clinicId, name, type).catch(next);
    if (channel === undefined) return;
    res.status(201).json({ success: true, data: { channel } });
  },
);

router.delete(
  "/channels/:id",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const deleted = await repo.delete(id!, req.user!.clinicId).catch(next);
    if (deleted === undefined) return;
    if (!deleted) return next(new NotFoundError("Channel not found"));
    res.json({ success: true });
  },
);

router.get(
  "/channels/stats",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const { dateFrom, dateTo } = req.query;
    let from: Date | undefined;
    let to: Date | undefined;
    if (typeof dateFrom === "string" && dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) from = d;
    }
    if (typeof dateTo === "string" && dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); to = d; }
    }
    const stats = await repo.getChannelStats(req.user!.clinicId, from, to).catch(next);
    if (stats === undefined) return;
    res.json({ success: true, data: { stats } });
  },
);

const updateClinicSchema = z.object({
  whatsappPhone: z.string().min(5).max(20),
});

router.patch(
  "/clinic/whatsapp-phone",
  roleGuard("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = updateClinicSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));
    const { whatsappPhone } = parsed.data;
    const [clinic] = await db
      .update(clinicsTable)
      .set({ whatsappPhone })
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .returning()
      .catch(next) ?? [];
    if (!clinic) return;
    res.json({ success: true, data: { clinic } });
  },
);

const greenApiSchema = z.object({
  greenApiInstanceId: z.string().min(1).max(60),
  greenApiToken: z.string().min(1).max(120),
});

router.patch(
  "/clinic/green-api",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = greenApiSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));
    const { greenApiInstanceId, greenApiToken } = parsed.data;

    // Read old instanceId to clear its cache entry
    const [old] = await db
      .select({ greenApiInstanceId: clinicsTable.greenApiInstanceId })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .limit(1)
      .catch(() => [undefined]) ?? [];
    if (old?.greenApiInstanceId) clearGreenApiStateCache(old.greenApiInstanceId);

    const rows = await db
      .update(clinicsTable)
      .set({ greenApiInstanceId, greenApiToken, whatsappPhone: null })
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .returning({ id: clinicsTable.id })
      .catch(next);
    if (!rows || rows.length === 0) return;

    // Also clear cache for the new instanceId in case it was cached before
    clearGreenApiStateCache(greenApiInstanceId);
    res.json({ success: true });
  },
);

router.delete(
  "/clinic/green-api",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    // Read current credentials before clearing them
    const [current] = await db
      .select({ greenApiInstanceId: clinicsTable.greenApiInstanceId, greenApiToken: clinicsTable.greenApiToken })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .limit(1)
      .catch(next) ?? [];
    if (!current) return;

    // Call Green API logout to properly unlink the WhatsApp device
    if (current.greenApiInstanceId && current.greenApiToken) {
      clearGreenApiStateCache(current.greenApiInstanceId);
      logoutGreenApiInstance(current.greenApiInstanceId, current.greenApiToken)
        .catch((err) => logger.warn({ err }, "Green API logout call failed — credentials will still be cleared"));
    }

    // Clear credentials from DB regardless of logout success
    const rows = await db
      .update(clinicsTable)
      .set({ greenApiInstanceId: null, greenApiToken: null, whatsappPhone: null })
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .returning({ id: clinicsTable.id })
      .catch(next);
    if (!rows || rows.length === 0) return;
    res.json({ success: true });
  },
);

router.get(
  "/clinic/green-api/qr",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const [clinic] = await db
      .select({ greenApiInstanceId: clinicsTable.greenApiInstanceId, greenApiToken: clinicsTable.greenApiToken })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .limit(1)
      .catch(next) ?? [];
    if (!clinic) return;
    if (!clinic.greenApiInstanceId || !clinic.greenApiToken) {
      return next(new NotFoundError("Green API credentials not configured"));
    }
    const qrResult = await getGreenApiQrCode(clinic.greenApiInstanceId, clinic.greenApiToken).catch(next);
    if (!qrResult) return;
    res.json({ success: true, data: qrResult });
  },
);

router.get(
  "/clinic/green-api/status",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const [clinic] = await db
      .select({ greenApiInstanceId: clinicsTable.greenApiInstanceId, greenApiToken: clinicsTable.greenApiToken })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .limit(1)
      .catch(next) ?? [];
    if (!clinic) return;
    if (!clinic.greenApiInstanceId || !clinic.greenApiToken) {
      return res.json({ success: true, data: { configured: false, connected: false, phone: null } });
    }
    const state = await getGreenApiState(clinic.greenApiInstanceId, clinic.greenApiToken).catch(next);
    if (!state) return;
    const connected = state.stateInstance === "authorized";

    // Get phone from state.wid, or fall back to getWaSettings if not present
    let phone: string | null = state.wid ? state.wid.replace("@c.us", "") : null;

    if (connected) {
      // If phone not in state, fetch it from getWaSettings
      if (!phone) {
        const waSettings = await getGreenApiWaSettings(clinic.greenApiInstanceId, clinic.greenApiToken).catch(() => null);
        if (waSettings?.instanceData?.wid) {
          phone = waSettings.instanceData.wid.replace("@c.us", "");
        }
      }

      // Persist phone number if we have it
      if (phone) {
        await db
          .update(clinicsTable)
          .set({ whatsappPhone: phone })
          .where(eq(clinicsTable.id, req.user!.clinicId))
          .catch(() => {});
      }

      // Always register webhook when connected — do NOT gate on phone presence.
      // This was the root cause of messages not being delivered: wid is often absent
      // from getStateInstance, so the webhook was never registered.
      // Throttle to once per 60 seconds to avoid hammering Green API's setSettings.
      const baseUrl = getServerBaseUrl();
      if (baseUrl && shouldRegisterWebhook(clinic.greenApiInstanceId)) {
        const webhookUrl = `${baseUrl}/api/webhook/greenapi/${req.user!.clinicId}`;
        logger.info({ webhookUrl, clinicId: req.user!.clinicId }, "Registering Green API webhook URL");
        setGreenApiWebhookUrl(clinic.greenApiInstanceId, clinic.greenApiToken, webhookUrl)
          .then(() => logger.info({ webhookUrl }, "Green API webhook URL registered successfully"))
          .catch((err) => logger.warn({ err }, "Failed to set Green API webhook URL — messages may not be delivered"));
      } else if (!baseUrl) {
        logger.warn("getServerBaseUrl returned null — cannot register Green API webhook. Set WEBHOOK_BASE_URL env var.");
      }
    }
    res.json({ success: true, data: { configured: true, connected, phone } });
  },
);

// POST /clinic/green-api/register-webhook — force webhook registration, bypassing throttle
router.post(
  "/clinic/green-api/register-webhook",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const [clinic] = await db
      .select({ greenApiInstanceId: clinicsTable.greenApiInstanceId, greenApiToken: clinicsTable.greenApiToken })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .limit(1)
      .catch(next) ?? [];
    if (!clinic) return;
    if (!clinic.greenApiInstanceId || !clinic.greenApiToken) {
      return res.status(400).json({ success: false, error: "Green API not configured" });
    }

    // Clear throttle so this registration always fires
    clearGreenApiStateCache(clinic.greenApiInstanceId);

    const baseUrl = getServerBaseUrl();
    if (!baseUrl) {
      return res.status(500).json({ success: false, error: "Server base URL not configured. Set WEBHOOK_BASE_URL env var." });
    }

    const webhookUrl = `${baseUrl}/api/webhook/greenapi/${req.user!.clinicId}`;
    logger.info({ webhookUrl, clinicId: req.user!.clinicId }, "Force-registering Green API webhook URL");
    await setGreenApiWebhookUrl(clinic.greenApiInstanceId, clinic.greenApiToken, webhookUrl).catch(next);
    logger.info({ webhookUrl }, "Green API webhook URL force-registered successfully");
    res.json({ success: true, data: { webhookUrl } });
  },
);

export const channelsRepo = repo;
export default router;
