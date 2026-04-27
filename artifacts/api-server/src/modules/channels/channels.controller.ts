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
import { getGreenApiQrCode, getGreenApiState, setGreenApiWebhookUrl, getServerBaseUrl, logoutGreenApiInstance, clearGreenApiStateCache, getGreenApiWaSettings, shouldRegisterWebhook, getGreenApiPairingCode, extractPhoneFromWaSettings, createPartnerInstance, deletePartnerInstance, isInstanceDeleted } from "../../shared/green-api";
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

// PATCH /clinic/whatsapp-phone — set or override the clinic WhatsApp phone number.
// Accepts { phone: "77071234567" } — digits only, no + or spaces.
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
    logger.info({ clinicId: req.user!.clinicId, phone: digits.slice(0, 5) + "***" }, "WhatsApp phone saved manually");
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

// POST /clinic/green-api/provision — auto-create a Green API instance via Partner API.
// If the clinic already has an instance, returns it without creating a new one.
router.post(
  "/clinic/green-api/provision",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const partnerToken = process.env["GREEN_API_PARTNER_TOKEN"];
    if (!partnerToken) {
      return res.status(503).json({
        success: false,
        error: "Partner API не настроен. Обратитесь в поддержку.",
      });
    }

    const [current] = await db
      .select({ greenApiInstanceId: clinicsTable.greenApiInstanceId, greenApiToken: clinicsTable.greenApiToken, greenApiUrl: clinicsTable.greenApiUrl })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .limit(1)
      .catch(next) ?? [];
    if (current === undefined) return;

    // If instance already provisioned — verify it still exists in Green API before returning it
    if (current.greenApiInstanceId && current.greenApiToken) {
      let staleInstance = false;
      try {
        await getGreenApiState(current.greenApiInstanceId, current.greenApiToken, current.greenApiUrl);
      } catch (err) {
        if (isInstanceDeleted(err)) {
          staleInstance = true;
          logger.warn({ instanceId: current.greenApiInstanceId, clinicId: req.user!.clinicId }, "Green API instance is deleted — clearing stale credentials and reprovisioning");
          clearGreenApiStateCache(current.greenApiInstanceId);
          await db.update(clinicsTable)
            .set({ greenApiInstanceId: null, greenApiToken: null, greenApiUrl: null })
            .where(eq(clinicsTable.id, req.user!.clinicId))
            .catch(() => {});
        }
      }
      if (!staleInstance) {
        logger.info({ instanceId: current.greenApiInstanceId, clinicId: req.user!.clinicId }, "Green API instance already provisioned — returning existing");
        return res.json({ success: true, data: { idInstance: current.greenApiInstanceId, isExisting: true } });
      }
    }

    const clinicId = req.user!.clinicId;

    // Helper: save the provisioned instance to DB and log
    const saveInstance = async (r: { idInstance: number; apiTokenInstance: string; apiUrl: string }) => {
      const instanceId = String(r.idInstance);
      await db
        .update(clinicsTable)
        .set({ greenApiInstanceId: instanceId, greenApiToken: r.apiTokenInstance, greenApiUrl: r.apiUrl })
        .where(eq(clinicsTable.id, clinicId));
      clearGreenApiStateCache(instanceId);
      logger.info({ instanceId, clinicId }, "Green API instance provisioned via Partner API");
    };

    // Start the Green API call immediately
    const provisionPromise = createPartnerInstance(partnerToken);

    // Try to get a result within 20 s so we can respond before any proxy cuts the connection.
    // If Green API takes longer we return "provisioning" immediately and finish in the background —
    // the frontend polls /status every 5 s and will pick up the instance once it appears in the DB.
    const EARLY_RESPONSE_MS = 20_000;
    let earlyResult: { idInstance: number; apiTokenInstance: string } | null = null;
    let timedOut = false;

    try {
      earlyResult = await Promise.race([
        provisionPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("PROVISION_TIMEOUT")), EARLY_RESPONSE_MS),
        ),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "PROVISION_TIMEOUT") {
        timedOut = true;
        // Background: keep waiting for Green API and save when ready
        provisionPromise
          .then(saveInstance)
          .catch((bgErr) => logger.error({ err: bgErr, clinicId }, "Green API background provisioning failed"));
        logger.info({ clinicId }, "Green API createInstance taking >20 s — responding early, saving in background");
      } else {
        logger.error({ err, clinicId }, "Green API createInstance (Partner API) failed");
        const isAuth = msg.includes("401") || msg.toLowerCase().includes("unauthorized");
        const userMsg = isAuth
          ? "Ошибка авторизации Green API (401 Unauthorized). Партнёрский токен недействителен или истёк — проверьте переменную GREEN_API_PARTNER_TOKEN в настройках сервера."
          : `Не удалось создать инстанс: ${msg}`;
        return res.status(502).json({ success: false, error: userMsg });
      }
    }

    if (timedOut) {
      // Let the frontend know provisioning is in progress; it will poll /status
      return res.json({ success: true, data: { idInstance: null, isExisting: false, provisioning: true } });
    }

    // Got a result quickly — save synchronously so the client can use it right away
    try {
      await saveInstance(earlyResult!);
    } catch (dbErr) {
      logger.error({ err: dbErr, clinicId }, "Failed to persist Green API instance to DB");
      return next(dbErr);
    }

    res.json({ success: true, data: { idInstance: String(earlyResult!.idInstance), isExisting: false } });
  },
);

router.delete(
  "/clinic/green-api",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    // Read current credentials before clearing them
    const [current] = await db
      .select({ greenApiInstanceId: clinicsTable.greenApiInstanceId, greenApiToken: clinicsTable.greenApiToken, greenApiUrl: clinicsTable.greenApiUrl })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .limit(1)
      .catch(next) ?? [];
    if (!current) return;

    // Call Green API logout to unlink the device from WhatsApp
    let greenApiLogoutOk = false;
    if (current.greenApiInstanceId && current.greenApiToken) {
      clearGreenApiStateCache(current.greenApiInstanceId);
      try {
        await logoutGreenApiInstance(current.greenApiInstanceId, current.greenApiToken, current.greenApiUrl);
        greenApiLogoutOk = true;
        logger.info({ instanceId: current.greenApiInstanceId }, "Green API logout succeeded — device unlinked");
      } catch (err) {
        logger.warn({ err, instanceId: current.greenApiInstanceId }, "Green API logout call failed — credentials will still be cleared from DB");
      }
    }

    // Clear credentials from DB regardless of Green API logout success
    const rows = await db
      .update(clinicsTable)
      .set({ greenApiInstanceId: null, greenApiToken: null, greenApiUrl: null, whatsappPhone: null })
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .returning({ id: clinicsTable.id })
      .catch(next);
    if (!rows || rows.length === 0) return;

    // Delete the partner-provisioned instance from Green API (fire-and-forget)
    const partnerToken = process.env["GREEN_API_PARTNER_TOKEN"];
    if (partnerToken && current.greenApiInstanceId) {
      deletePartnerInstance(current.greenApiInstanceId, partnerToken)
        .then(() => logger.info({ instanceId: current.greenApiInstanceId }, "Partner instance deleted from Green API"))
        .catch((err) => logger.warn({ err, instanceId: current.greenApiInstanceId }, "Failed to delete partner instance — it may remain active in Green API dashboard"));
    }

    res.json({
      success: true,
      data: {
        greenApiLogoutOk,
        message: greenApiLogoutOk
          ? "WhatsApp отключён — устройство удалено из телефона и инстанс удалён из Green API"
          : "Данные удалены из CRM, но отключить Green API не удалось — выйдите вручную через green-api.com",
      },
    });
  },
);

router.get(
  "/clinic/green-api/qr",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const [clinic] = await db
      .select({ greenApiInstanceId: clinicsTable.greenApiInstanceId, greenApiToken: clinicsTable.greenApiToken, greenApiUrl: clinicsTable.greenApiUrl })
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
      qrResult = await getGreenApiQrCode(clinic.greenApiInstanceId, clinic.greenApiToken, clinic.greenApiUrl);
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
      .select({ greenApiInstanceId: clinicsTable.greenApiInstanceId, greenApiToken: clinicsTable.greenApiToken, greenApiUrl: clinicsTable.greenApiUrl })
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
      result = await getGreenApiPairingCode(clinic.greenApiInstanceId, clinic.greenApiToken, phoneNumber, clinic.greenApiUrl);
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
      .select({
        greenApiInstanceId: clinicsTable.greenApiInstanceId,
        greenApiToken: clinicsTable.greenApiToken,
        greenApiUrl: clinicsTable.greenApiUrl,
        whatsappPhone: clinicsTable.whatsappPhone,
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, req.user!.clinicId))
      .limit(1)
      .catch(next) ?? [];
    if (!clinic) return;
    if (!clinic.greenApiInstanceId || !clinic.greenApiToken) {
      return res.json({ success: true, data: { configured: false, connected: false, phone: clinic.whatsappPhone ?? null } });
    }
    let state: Awaited<ReturnType<typeof getGreenApiState>>;
    try {
      state = await getGreenApiState(clinic.greenApiInstanceId, clinic.greenApiToken, clinic.greenApiUrl);
    } catch (err) {
      logger.warn({ err, instanceId: clinic.greenApiInstanceId }, "Green API getStateInstance failed — instance may still be initializing");
      // If the instance was deleted in Green API, clear stale DB credentials so the UI shows provision button
      if (isInstanceDeleted(err)) {
        logger.warn({ instanceId: clinic.greenApiInstanceId, clinicId: req.user!.clinicId }, "Instance deleted in Green API — clearing stale credentials from DB");
        clearGreenApiStateCache(clinic.greenApiInstanceId);
        await db.update(clinicsTable)
          .set({ greenApiInstanceId: null, greenApiToken: null, greenApiUrl: null })
          .where(eq(clinicsTable.id, req.user!.clinicId))
          .catch(() => {});
        return res.json({ success: true, data: { configured: false, connected: false, phone: clinic.whatsappPhone ?? null, stateInstance: "deleted" } });
      }
      const msg = err instanceof Error ? err.message : String(err);
      // Distinguish auth failures (bad credentials) from initialization-in-progress (404/timeout).
      // Auth errors should surface as "error" so the UI doesn't spin forever.
      const isAuthError = msg.includes(": 401") || msg.includes(": 403") ||
        msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("forbidden");
      const derivedState = isAuthError ? "error" : "initializing";
      return res.json({ success: true, data: { configured: true, connected: false, phone: null, stateInstance: derivedState } });
    }
    const connected = state.stateInstance === "authorized";

    // Get phone from state.wid, or fall back to getWaSettings if not present
    let phone: string | null = state.wid ? state.wid.replace("@c.us", "") : null;

    if (connected) {
      // If phone not in state, fetch it from getWaSettings.
      // Green API uses different field names across plan tiers (wid / chatId / phone / phoneNumber).
      // extractPhoneFromWaSettings() handles all variants.
      if (!phone) {
        const waSettings = await getGreenApiWaSettings(clinic.greenApiInstanceId, clinic.greenApiToken, clinic.greenApiUrl).catch(() => null);
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
        setGreenApiWebhookUrl(clinic.greenApiInstanceId, clinic.greenApiToken, webhookUrl, clinic.greenApiUrl)
          .then(() => logger.info({ webhookUrl }, "Green API webhook URL registered successfully"))
          .catch((err) => logger.warn({ err }, "Failed to set Green API webhook URL — messages may not be delivered"));
      } else if (!baseUrl) {
        logger.warn("getServerBaseUrl returned null — cannot register Green API webhook. Set WEBHOOK_BASE_URL env var.");
      }
    }
    // Always prefer the phone manually set by the user (step 1 of modal).
    // Green API on business plans returns an internal ID in wid/phone fields, not the real number.
    const finalPhone = clinic.whatsappPhone ?? phone;

    // Disable ETag/304 caching — state can change at any moment (QR scan)
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({ success: true, data: { configured: true, connected, phone: finalPhone, stateInstance: state.stateInstance } });
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
