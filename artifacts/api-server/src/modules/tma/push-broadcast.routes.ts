import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { ValidationError } from "../../shared/errors";
import {
  executePushBroadcast,
  getPushBroadcastStats,
  listPushBroadcasts,
} from "../../shared/push-notifications";

const router = Router();

const broadcastSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  url: z.string().trim().max(256).optional(),
  clinicId: z.string().trim().min(1).max(64).optional(),
});

router.get("/push/broadcasts/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = typeof req.query["clinicId"] === "string" ? req.query["clinicId"] : undefined;
    const stats = await getPushBroadcastStats(clinicId);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});

router.get("/push/broadcasts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const broadcasts = await listPushBroadcasts(50);
    res.json({ success: true, data: { broadcasts } });
  } catch (err) {
    next(err);
  }
});

router.post("/push/broadcasts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }

    const { title, body, url, clinicId } = parsed.data;

    const stats = await getPushBroadcastStats(clinicId);
    if (stats.devices === 0) {
      return next(
        new ValidationError(
          clinicId
            ? "В этой клинике нет активных push-подписок PWA"
            : "Нет активных push-подписок. Пользователи должны включить push в приложении.",
        ),
      );
    }

    const result = await executePushBroadcast({
      title,
      body,
      url: url || "/",
      clinicId,
      createdByTgId: req.tmaUser?.telegramUserId,
      createdByName: req.tmaUser?.name,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
