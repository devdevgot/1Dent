import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { aiCreditsService } from "../../shared/ai-credits";

const router: IRouter = Router();
const canRead = roleGuard("owner", "admin", "doctor", "accountant");

router.use(authMiddleware);

router.get("/summary", canRead, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await aiCreditsService.getSummary(req.user!.clinicId);
    res.json({ success: true, data: { summary } });
  } catch (err) {
    next(err);
  }
});

router.get("/usage", canRead, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
    const usage = await aiCreditsService.listUsage(req.user!.clinicId, Math.min(limit, 200));
    res.json({ success: true, data: { usage } });
  } catch (err) {
    next(err);
  }
});

export default router;
