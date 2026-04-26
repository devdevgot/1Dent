import { Router, type Request, type Response, type NextFunction } from "express";
import { db, dentalBroadcastRunsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { runDentalBroadcastForClinic } from "./dental-broadcast.service";
import { ValidationError } from "../../shared/errors";

const router = Router();
const ownerAdmin = roleGuard("owner", "admin");

router.get(
  "/runs",
  authMiddleware,
  ownerAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user!.clinicId;
      const rawLimit = req.query["limit"];
      const limit =
        typeof rawLimit === "string" ? Math.min(parseInt(rawLimit, 10) || 20, 100) : 20;

      const runs = await db
        .select()
        .from(dentalBroadcastRunsTable)
        .where(eq(dentalBroadcastRunsTable.clinicId, clinicId))
        .orderBy(desc(dentalBroadcastRunsTable.startedAt))
        .limit(limit);

      res.json({ success: true, data: { runs } });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/trigger",
  authMiddleware,
  ownerAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user!.clinicId;

      const [existingRunning] = await db
        .select({ id: dentalBroadcastRunsTable.id })
        .from(dentalBroadcastRunsTable)
        .where(
          and(
            eq(dentalBroadcastRunsTable.clinicId, clinicId),
            eq(dentalBroadcastRunsTable.status, "running"),
          ),
        )
        .limit(1);

      if (existingRunning) {
        return next(new ValidationError("Рассылка уже выполняется"));
      }

      const run = await runDentalBroadcastForClinic(clinicId);

      res.status(201).json({ success: true, data: { run } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
