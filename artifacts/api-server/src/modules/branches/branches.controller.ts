import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { BranchesRepository } from "./branches.repository";

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
    const branch = await repo.updateBranch(req.params["id"]!, req.user!.clinicId, parsed.data);
    if (!branch) return next(new NotFoundError("Branch not found"));
    res.json({ success: true, data: { branch } });
  } catch (err) { next(err); }
});

router.delete("/branches/:id", ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await repo.deleteBranch(req.params["id"]!, req.user!.clinicId);
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

    const event = await repo.logGeoEvent({ clinicId, userId, branchId, eventType });

    const tg = await repo.getClinicTelegram(clinicId);
    if (tg?.telegramBotToken && tg.telegramOwnerChatId) {
      const userName = await repo.getUserName(userId);
      const now = new Date();
      const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });
      const emoji = eventType === "checkin" ? "✅" : "🚪";
      const verb = eventType === "checkin" ? "пришёл в" : "ушёл из";
      const text = `${emoji} <b>${userName}</b> ${verb} <b>${branch.name}</b> — ${timeStr}`;
      void sendTelegramMessage(tg.telegramBotToken, tg.telegramOwnerChatId, text);
    }

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

export default router;
