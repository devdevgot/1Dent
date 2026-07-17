import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import {
  buildTestNotificationPushPayload,
  buildTestTrackingPushPayload,
  deleteAllPushSubscriptions,
  deletePushSubscription,
  getVapidPublicKey,
  isWebPushConfigured,
  sendWebPushToUser,
  upsertPushSubscription,
} from "../../shared/push-notifications";

const router = Router();

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

const testSchema = z.object({
  kind: z.enum(["tracking", "notification"]).optional().default("notification"),
});

router.get("/push/vapid-public-key", authMiddleware, (_req: Request, res: Response) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    res.json({ success: true, data: { publicKey: null, enabled: false } });
    return;
  }
  res.json({ success: true, data: { publicKey, enabled: true } });
});

router.get("/push/status", authMiddleware, (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      enabled: isWebPushConfigured(),
      publicKey: getVapidPublicKey(),
    },
  });
});

router.post("/push/subscribe", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isWebPushConfigured()) {
      return next(new ValidationError("Push-уведомления не настроены на сервере"));
    }

    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }

    const { userId, clinicId } = req.user!;
    await upsertPushSubscription({
      userId,
      clinicId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/push/subscribe", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }

    await deletePushSubscription(req.user!.userId, parsed.data.endpoint);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/push/subscribe/all", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteAllPushSubscriptions(req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/push/test", authMiddleware, roleGuard("owner"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isWebPushConfigured()) {
      return next(new ValidationError("Push-уведомления не настроены на сервере (VAPID ключи)"));
    }

    const parsed = testSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }

    const payload =
      parsed.data.kind === "tracking"
        ? buildTestTrackingPushPayload()
        : buildTestNotificationPushPayload();

    const sent = await sendWebPushToUser(req.user!.userId, payload);
    if (sent === 0) {
      return next(
        new ValidationError(
          "Нет активных push-подписок. Разрешите уведомления в настройках аккаунта и откройте PWA.",
        ),
      );
    }

    res.json({ success: true, data: { sent } });
  } catch (err) {
    next(err);
  }
});

export default router;
