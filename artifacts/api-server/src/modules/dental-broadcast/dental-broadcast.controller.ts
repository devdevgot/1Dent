import { Router, type Request, type Response, type NextFunction } from "express";
import { db, dentalBroadcastRunsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { runDentalBroadcastForClinic } from "./dental-broadcast.service";
import { computeRates, listPatientBroadcastHistory } from "./dental-broadcast-metrics";
import { ValidationError } from "../../shared/errors";
import { MessagesRepository } from "../messages/messages.repository";

const router = Router();
const ownerAdmin = roleGuard("owner", "admin");
const messagesRepo = new MessagesRepository();

function enrichRun(run: typeof dentalBroadcastRunsTable.$inferSelect) {
  const { replyRate, bookingRate } = computeRates(
    run.messagesSent,
    run.repliesCount,
    run.bookingsCount,
  );
  return { ...run, replyRate, bookingRate };
}

router.get(
  "/runs",
  authMiddleware,
  ownerAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user!.clinicId;
      const rawLimit = req.query["limit"];
      const limit =
        typeof rawLimit === "string" ? Math.max(1, Math.min(parseInt(rawLimit, 10) || 20, 100)) : 20;

      const runs = await db
        .select()
        .from(dentalBroadcastRunsTable)
        .where(eq(dentalBroadcastRunsTable.clinicId, clinicId))
        .orderBy(desc(dentalBroadcastRunsTable.startedAt))
        .limit(limit);

      res.json({ success: true, data: { runs: runs.map(enrichRun) } });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/patients/:patientId/history",
  authMiddleware,
  ownerAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user!.clinicId;
      const patientId = String(req.params["patientId"]);

      const patient = await messagesRepo.findPatient(patientId, clinicId);
      if (!patient) {
        return next(new ValidationError("Пациент не найден"));
      }

      const deliveries = await listPatientBroadcastHistory(clinicId, patientId);
      res.json({ success: true, data: { deliveries } });
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

      res.status(201).json({ success: true, data: { run: enrichRun(run) } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
