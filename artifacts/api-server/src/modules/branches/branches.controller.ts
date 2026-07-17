import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { authMiddleware, roleGuard, selfOrRoleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { BranchesRepository } from "./branches.repository";
import {
  buildTrackingPushPayload,
  sendWebPushToClinicRoles,
} from "../../shared/push-notifications";

const router: IRouter = Router();
const repo = new BranchesRepository();

router.use(authMiddleware);

const ownerOnly = roleGuard("owner");
const allStaff = roleGuard("owner", "admin", "doctor", "accountant", "warehouse");

const branchSchema = z.object({
  name: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(10).max(10000).default(200),
});

const telegramSchema = z.object({
  telegramBotToken: z.string().nullable(),
  telegramOwnerChatId: z.string().nullable(),
});

async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch {
    // Non-critical — don't throw
  }
}

router.get("/branches", allStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branches = await repo.listBranches(req.user!.clinicId);
    res.json({ success: true, data: { branches } });
  } catch (err) { next(err); }
});

router.post("/branches", ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = branchSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const branch = await repo.createBranch(req.user!.clinicId, parsed.data);
    res.status(201).json({ success: true, data: { branch } });
  } catch (err) { next(err); }
});

router.put("/branches/:id", ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = branchSchema.partial().safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    const branch = await repo.updateBranch(req.params["id"] as string, req.user!.clinicId, parsed.data);
    if (!branch) return next(new NotFoundError("Branch not found"));
    res.json({ success: true, data: { branch } });
  } catch (err) { next(err); }
});

router.delete("/branches/:id", ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await repo.deleteBranch(req.params["id"] as string, req.user!.clinicId);
    if (!deleted) return next(new NotFoundError("Branch not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post("/geo/event", allStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      branchId: z.string(),
      eventType: z.enum(["checkin", "checkout"]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));

    const { branchId, eventType } = parsed.data;
    const { clinicId, userId } = req.user!;

    const branch = await repo.getBranch(branchId, clinicId);
    if (!branch) return next(new NotFoundError("Branch not found"));

    // ── Deduplication: prevent duplicate events from page reloads ──────────
    const lastEvent = await repo.getLastGeoEvent(userId, branchId);
    if (lastEvent) {
      const ageMs = Date.now() - new Date(lastEvent.occurredAt).getTime();
      // Same event type within 3 minutes → idempotent, skip silently
      if (lastEvent.eventType === eventType && ageMs < 3 * 60 * 1000) {
        return res.json({ success: true, data: { event: lastEvent } });
      }
      // checkout→checkin within 30s → page reload cycle, skip
      if (lastEvent.eventType === "checkout" && eventType === "checkin" && ageMs < 30 * 1000) {
        return res.json({ success: true, data: { event: lastEvent } });
      }
    }

    const event = await repo.logGeoEvent({ clinicId, userId, branchId, eventType });

    const tg = await repo.getClinicTelegram(clinicId);
    const userName = await repo.getUserName(userId);
    const now = new Date();
    const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });
    const emoji = eventType === "checkin" ? "✅" : "🚪";
    const verb = eventType === "checkin" ? "пришёл в" : "ушёл из";
    const text = `${emoji} <b>${userName}</b> ${verb} <b>${branch.name}</b> — ${timeStr}`;

    // Clinic's own bot takes priority; fall back to tracking bot if not configured
    if (tg?.telegramBotToken && tg.telegramOwnerChatId) {
      void sendTelegramMessage(tg.telegramBotToken, tg.telegramOwnerChatId, text);
    } else {
      const trackingToken = process.env["TRACKING_TG_BOT_TOKEN"];
      if (trackingToken && tg?.telegramPlatformChatId) {
        void sendTelegramMessage(trackingToken, tg.telegramPlatformChatId, text);
      }
    }

    void sendWebPushToClinicRoles(
      clinicId,
      ["owner", "admin"],
      buildTrackingPushPayload({
        userName,
        branchName: branch.name,
        eventType,
        timeStr,
      }),
    );

    res.json({ success: true, data: { event } });
  } catch (err) { next(err); }
});

router.get("/clinic/telegram-settings", ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await repo.getClinicTelegram(req.user!.clinicId);
    res.json({
      success: true,
      data: {
        telegramBotToken: settings?.telegramBotToken ?? null,
        telegramOwnerChatId: settings?.telegramOwnerChatId ?? null,
        telegramPlatformChatId: settings?.telegramPlatformChatId ?? null,
        telegramConnectToken: settings?.telegramConnectToken ?? null,
      },
    });
  } catch (err) { next(err); }
});

router.put("/clinic/telegram-settings", ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = telegramSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    await repo.updateClinicTelegram(req.user!.clinicId, parsed.data);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post("/clinic/telegram-test", ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = telegramSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError("Invalid settings"));
    const { telegramBotToken, telegramOwnerChatId } = parsed.data;
    if (!telegramBotToken || !telegramOwnerChatId) {
      return next(new ValidationError("Bot token and chat ID are required"));
    }
    await sendTelegramMessage(telegramBotToken, telegramOwnerChatId, "✅ 1Dent CRM: Telegram-уведомления настроены!");
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── GET /api/geo/tracking ─────────────────────────────────────────────────────
// Returns geo events for the clinic, optionally filtered by branchId and date range
router.get("/geo/tracking", (req: Request, res: Response, next: NextFunction) => {
  const userId = typeof req.query["userId"] === "string" ? req.query["userId"] : undefined;
  const guard = userId
    ? selfOrRoleGuard(() => userId, "owner", "admin")
    : roleGuard("owner", "admin");
  return guard(req, res, next);
}, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, userId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const from = dateFrom ? new Date(dateFrom) : todayStart;
    const to = dateTo ? new Date(dateTo) : todayEnd;

    const events = await repo.getGeoTracking(req.user!.clinicId, {
      branchId: branchId || undefined,
      userId: userId || undefined,
      dateFrom: from,
      dateTo: to,
    });

    res.json({ success: true, data: { events } });
  } catch (err) { next(err); }
});

// ── POST /api/clinic/telegram-connect/generate ───────────────────────────────
// Generates a unique deep-link token for the clinic owner to connect via tracking bot
router.post("/clinic/telegram-connect/generate", ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const trackingToken = process.env["TRACKING_TG_BOT_TOKEN"];
    if (!trackingToken) return next(new ValidationError("Бот для уведомлений не настроен (TRACKING_TG_BOT_TOKEN)"));

    // Get bot username to build the link
    const meRes = await fetch(`https://api.telegram.org/bot${trackingToken}/getMe`);
    const me = await meRes.json() as { ok: boolean; result?: { username: string } };
    if (!me.ok || !me.result?.username) return next(new ValidationError("Не удалось получить данные бота для уведомлений"));

    const connectToken = randomBytes(16).toString("hex");
    await repo.updateClinicTelegram(req.user!.clinicId, { telegramConnectToken: connectToken });

    const deepLink = `https://t.me/${me.result.username}?start=${connectToken}`;
    res.json({ success: true, data: { deepLink, botUsername: me.result.username } });
  } catch (err) { next(err); }
});

// ── POST /api/clinic/telegram-platform-test ──────────────────────────────────
router.post("/clinic/telegram-platform-test", ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const trackingToken = process.env["TRACKING_TG_BOT_TOKEN"];
    if (!trackingToken) return next(new ValidationError("Бот для уведомлений не настроен"));
    const settings = await repo.getClinicTelegram(req.user!.clinicId);
    if (!settings?.telegramPlatformChatId) return next(new ValidationError("Telegram не подключён — используйте кнопку «Подключить»"));
    await sendTelegramMessage(trackingToken, settings.telegramPlatformChatId, "✅ 1Dent CRM: Telegram-уведомления подключены и работают!");
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── DELETE /api/clinic/telegram-platform-disconnect ──────────────────────────
router.delete("/clinic/telegram-platform-disconnect", ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await repo.updateClinicTelegram(req.user!.clinicId, {
      telegramPlatformChatId: null,
      telegramConnectToken: null,
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
