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
import { and, eq, isNull } from "drizzle-orm";
import { getGreenApiQrCode, getGreenApiState, setGreenApiWebhookUrl, getServerBaseUrl, logoutGreenApiInstance, clearGreenApiStateCache, getGreenApiWaSettings, shouldRegisterWebhook, getGreenApiPairingCode, extractPhoneFromWaSettings } from "../../shared/green-api";
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

// PATCH /clinic/whatsapp-phone — manual override for the WhatsApp phone number
// Used when Green API returns a wrong/internal number and the user needs to correct it.
router.patch(
  "/clinic/whatsapp-phone",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const raw = req.body?.phone;
    if (typeof raw !== "string") return next(new ValidationError("phone is required"));
    const digits = raw.replace(/\D/g, "");
    if (!digits || digits.length < 7 || digits.length > 15) {
      return next(new ValidationError("Введите корректный номер (7–15 цифр)"));
    }
    await db
      .update(clinicsTable)
      .set({ whatsappPhone: digits })
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .catch(next);
    logger.info({ clinicId: req.user!.clinicId, phone: digits.slice(0, 5) + "***" }, "WhatsApp phone overridden manually");
    res.json({ success: true, data: { phone: digits } });
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

    // Note: we deliberately do NOT clear whatsappPhone here.
    // The user may have entered their real phone number before connecting,
    // and we want to preserve that manually-set value.
    const rows = await db
      .update(clinicsTable)
      .set({ greenApiInstanceId, greenApiToken })
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
    let qrResult;
    try {
      qrResult = await getGreenApiQrCode(clinic.greenApiInstanceId, clinic.greenApiToken);
      logger.info({ instanceId: clinic.greenApiInstanceId, type: qrResult.type }, "Green API QR fetched");
    } catch (err) {
      logger.error({ err, instanceId: clinic.greenApiInstanceId }, "Green API QR fetch failed");
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("Timeout") || msg.includes("timeout") || msg.includes("abort") || msg.includes("Abort");
      const is500 = msg.includes(": 500");
      const is401 = msg.includes(": 401") || msg.includes(": 403");
      let userMsg: string;
      if (isTimeout) {
        userMsg = "Сервер Green API не отвечает (таймаут). Это временная проблема — подождите 30 секунд и попробуйте снова.";
      } else if (is500) {
        userMsg = "Green API вернул ошибку (500). Возможно, инстанс уже авторизован в WhatsApp — попробуйте способ «По номеру» (pairing code) или отключите инстанс в личном кабинете Green API и повторите.";
      } else if (is401) {
        userMsg = "Неверный ID инстанса или токен. Проверьте данные в личном кабинете green-api.com.";
      } else {
        userMsg = `Green API вернул ошибку: ${msg}`;
      }
      return res.status(502).json({ success: false, error: userMsg });
    }
    res.json({ success: true, data: qrResult });
  },
);

const pairingCodeSchema = z.object({
  phoneNumber: z.string().min(7).max(20),
});

router.post(
  "/clinic/green-api/pairing-code",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = pairingCodeSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));
    const { phoneNumber } = parsed.data;

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

    let result;
    try {
      result = await getGreenApiPairingCode(clinic.greenApiInstanceId, clinic.greenApiToken, phoneNumber);
      logger.info({ instanceId: clinic.greenApiInstanceId, status: result.status }, "Green API pairing code fetched");
    } catch (err) {
      logger.error({ err, instanceId: clinic.greenApiInstanceId }, "Green API pairing code fetch failed");
      const msg = err instanceof Error ? err.message : String(err);
      const msgLower = msg.toLowerCase();
      // Detect "already authorized" — instance already has an active WhatsApp session
      if (
        msgLower.includes("already") ||
        msgLower.includes("authorized") ||
        msgLower.includes("авторизован") ||
        msgLower.includes("authorized") ||
        msgLower.includes("active") ||
        // HTTP 409 Conflict or 400 with "already" body
        msgLower.includes("409")
      ) {
        return res.status(400).json({
          success: false,
          error: "Инстанс уже авторизован в WhatsApp. Сначала выйдите из аккаунта через кнопку «Отключить», затем повторите подключение. Или используйте метод QR-кода, если устройство уже привязано.",
          code: "ALREADY_AUTHORIZED",
        });
      }
      return res.status(502).json({
        success: false,
        error: `Не удалось получить код от Green API. Убедитесь, что инстанс НЕ авторизован (должен быть в состоянии "notAuthorized"). Ошибка: ${msg}`,
      });
    }

    if (!result.authorizationCode) {
      const msgLower = (result.message ?? "").toLowerCase();
      if (
        msgLower.includes("already") ||
        msgLower.includes("authorized") ||
        msgLower.includes("авторизован")
      ) {
        return res.status(400).json({
          success: false,
          error: "Инстанс уже авторизован в WhatsApp. Сначала нажмите «Отключить», затем повторите подключение.",
          code: "ALREADY_AUTHORIZED",
        });
      }
      return res.status(400).json({
        success: false,
        error: result.message ?? "Не удалось получить код. Убедитесь, что инстанс НЕ авторизован и номер телефона верный.",
      });
    }

    res.json({ success: true, data: { code: result.authorizationCode } });
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
    let state: Awaited<ReturnType<typeof getGreenApiState>>;
    try {
      state = await getGreenApiState(clinic.greenApiInstanceId, clinic.greenApiToken);
    } catch (err) {
      logger.warn({ err, instanceId: clinic.greenApiInstanceId }, "Green API getStateInstance failed — returning not-connected");
      return res.json({ success: true, data: { configured: true, connected: false, phone: null } });
    }
    const connected = state.stateInstance === "authorized";

    // Get phone from state.wid, or fall back to getWaSettings if not present
    let phone: string | null = state.wid ? state.wid.replace("@c.us", "") : null;

    if (connected) {
      // If phone not in state, fetch it from getWaSettings.
      // Green API uses different field names across plan tiers (wid / chatId / phone / phoneNumber).
      // extractPhoneFromWaSettings() handles all variants.
      if (!phone) {
        const waSettings = await getGreenApiWaSettings(clinic.greenApiInstanceId, clinic.greenApiToken).catch(() => null);
        phone = extractPhoneFromWaSettings(waSettings);
        logger.info({ instanceId: clinic.greenApiInstanceId, waSettingsKeys: waSettings ? Object.keys(waSettings) : null, resolvedPhone: phone ? phone.slice(0, 5) + "***" : null }, "Green API WaSettings phone extraction");
      }

      // Persist phone number only if not already manually set by the user (whatsapp_phone IS NULL)
      if (phone) {
        await db
          .update(clinicsTable)
          .set({ whatsappPhone: phone })
          .where(and(eq(clinicsTable.id, req.user!.clinicId), isNull(clinicsTable.whatsappPhone)))
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
    // Disable ETag/304 caching — state can change at any moment (QR scan)
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
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
