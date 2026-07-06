import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { logsService } from "./logs.service";

const router: IRouter = Router();
router.use(authMiddleware);

router.get(
  "/",
  roleGuard("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    const {
      userId,
      actionType,
      entityType,
      dateFrom,
      dateTo,
      page,
      limit,
    } = req.query as Record<string, string | undefined>;

    const result = await logsService
      .list({
        clinicId: req.user!.clinicId,
        userId: userId || undefined,
        actionType: actionType || undefined,
        entityType: entityType || undefined,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`) : undefined,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 50,
      })
      .catch(next);
    if (!result) return;

    res.json({ success: true, data: result });
  },
);

export default router;
