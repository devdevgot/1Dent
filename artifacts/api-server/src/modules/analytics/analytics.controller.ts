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

// GET /analytics — role-adaptive endpoint (used by frontend)
router.get(
  "/analytics",
  allRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId, role, userId } = req.user!;

    if (role === "owner" || role === "accountant") {
      const analytics = await repo.getOwnerAnalytics(clinicId).catch(next);
      if (analytics === undefined) return;
      return res.json({ success: true, data: { role: role === "accountant" ? "accountant" : "owner", analytics } });
    }

    if (role === "admin") {
      const analytics = await repo.getAdminAnalytics(clinicId).catch(next);
      if (analytics === undefined) return;
      return res.json({ success: true, data: { role: "admin", analytics } });
    }

    if (role === "doctor") {
      const analytics = await repo.getDoctorAnalytics(clinicId, userId).catch(next);
      if (analytics === undefined) return;
      return res.json({ success: true, data: { role: "doctor", analytics } });
    }

    if (role === "warehouse") {
      const analytics = await repo.getAdminAnalytics(clinicId).catch(next);
      if (analytics === undefined) return;
      return res.json({ success: true, data: { role: "warehouse", analytics } });
    }

    return next(new ForbiddenError("Insufficient permissions"));
  },
);

// GET /analytics/owner — owner/accountant analytics
router.get(
  "/analytics/owner",
  roleGuard("owner", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId } = req.user!;
    const analytics = await repo.getOwnerAnalytics(clinicId).catch(next);
    if (analytics === undefined) return;
    res.json({ success: true, data: { role: "owner", analytics } });
  },
);

// GET /analytics/admin — admin/warehouse analytics
router.get(
  "/analytics/admin",
  roleGuard("owner", "admin", "warehouse"),
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId } = req.user!;
    const analytics = await repo.getAdminAnalytics(clinicId).catch(next);
    if (analytics === undefined) return;
    res.json({ success: true, data: { role: "admin", analytics } });
  },
);

// GET /analytics/doctor — doctor's own analytics
router.get(
  "/analytics/doctor",
  roleGuard("owner", "admin", "doctor"),
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId, userId } = req.user!;
    const analytics = await repo.getDoctorAnalytics(clinicId, userId).catch(next);
    if (analytics === undefined) return;
    res.json({ success: true, data: { role: "doctor", analytics } });
  },
);

// GET /analytics/doctor/me/detailed — doctor's own detailed analytics (charts)
router.get(
  "/analytics/doctor/me/detailed",
  roleGuard("owner", "admin", "doctor"),
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId, userId } = req.user!;
    const analytics = await repo.getDoctorDetailedAnalytics(clinicId, userId).catch(next);
    if (analytics === undefined) return;
    res.json({ success: true, data: { analytics } });
  },
);

// GET /analytics/doctor/:doctorId — detailed analytics for a specific doctor (owner/admin)
router.get(
  "/analytics/doctor/:doctorId",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId } = req.user!;
    const { doctorId } = req.params;
    const analytics = await repo.getDoctorDetailedAnalytics(clinicId, doctorId!).catch(next);
    if (analytics === undefined) return;
    res.json({ success: true, data: { analytics } });
  },
);

// GET /kpi/doctors — owner/admin only
router.get(
  "/kpi/doctors",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId } = req.user!;
    const kpis = await repo.getDoctorKpis(clinicId).catch(next);
    if (kpis === undefined) return;
    res.json({ success: true, data: { kpis } });
  },
);

export { repo as analyticsRepo };
export default router;
