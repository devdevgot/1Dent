import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import { ChatbotService } from "./chatbot.service";

const router: IRouter = Router();
const service = new ChatbotService();

router.use(authMiddleware);

const settingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  greetingTemplate: z.string().min(1).max(500).optional(),
  followup24hTemplate: z.string().min(1).max(500).optional(),
  followup72hTemplate: z.string().min(1).max(500).optional(),
  followup168hTemplate: z.string().min(1).max(500).optional(),
});

router.get(
  "/settings",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const settings = await service.getSettings(req.user!.clinicId).catch(next);
    if (!settings) return;
    res.json({ success: true, data: { settings } });
  },
);

router.put(
  "/settings",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = settingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const settings = await service.updateSettings(req.user!.clinicId, parsed.data).catch(next);
    if (!settings) return;
    res.json({ success: true, data: { settings } });
  },
);

router.get(
  "/sessions",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const sessions = await service.listSessions(req.user!.clinicId).catch(next);
    if (!sessions) return;
    res.json({ success: true, data: { sessions } });
  },
);

router.delete(
  "/sessions/:phone",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const phone = String(req.params["phone"]);
    await service.clearSession(req.user!.clinicId, phone).catch(next);
    res.json({ success: true });
  },
);

export default router;
