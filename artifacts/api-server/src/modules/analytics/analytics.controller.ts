import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { AnalyticsRepository } from "./analytics.repository";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ForbiddenError } from "../../shared/errors";

const router: IRouter = Router();
const repo = new AnalyticsRepository();

router.use(authMiddleware);

const ownerAdminRoles = roleGuard("owner", "admin");
const allRoles = roleGuard("owner", "admin", "doctor", "accountant", "warehouse");

// GET /analytics — role-adaptive endpoint
router.get(
  "/analytics",
  allRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId, role, userId } = req.user!;

    if (role === "owner" || role === "accountant") {
      const analytics = await repo.getOwnerAnalytics(clinicId).catch(next);
      if (!analytics) return;
      return res.json({ success: true, data: { role: "owner", analytics } });
    }

    if (role === "admin") {
      const analytics = await repo.getAdminAnalytics(clinicId).catch(next);
      if (!analytics) return;
      return res.json({ success: true, data: { role: "admin", analytics } });
    }

    if (role === "doctor") {
      const analytics = await repo.getDoctorAnalytics(clinicId, userId).catch(next);
      if (!analytics) return;
      return res.json({ success: true, data: { role: "doctor", analytics } });
    }

    if (role === "warehouse") {
      const analytics = await repo.getAdminAnalytics(clinicId).catch(next);
      if (!analytics) return;
      return res.json({ success: true, data: { role: "warehouse", analytics } });
    }

    return next(new ForbiddenError("Insufficient permissions"));
  },
);

// GET /kpi/doctors — owner/admin only
router.get(
  "/kpi/doctors",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId } = req.user!;
    const kpis = await repo.getDoctorKpis(clinicId).catch(next);
    if (!kpis) return;
    res.json({ success: true, data: { kpis } });
  },
);

export default router;
