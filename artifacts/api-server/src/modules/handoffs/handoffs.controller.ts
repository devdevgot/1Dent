import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { doctorHandoffsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";

const router: IRouter = Router();

router.use(authMiddleware);

const createHandoffSchema = z.object({
  fromDoctorId: z.string().min(1),
  toDoctorId: z.string().min(1),
  procedureId: z.string().optional(),
  reason: z.string().max(500).optional(),
});

// POST /handoffs — record a doctor handoff
router.post(
  "/",
  roleGuard("owner", "admin", "doctor"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = createHandoffSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const { clinicId } = req.user!;
    const { fromDoctorId, toDoctorId, procedureId, reason } = parsed.data;

    try {
      const [handoff] = await db
        .insert(doctorHandoffsTable)
        .values({
          id: randomUUID(),
          clinicId,
          fromDoctorId,
          toDoctorId,
          procedureId: procedureId ?? null,
          reason: reason ?? null,
        })
        .returning();

      if (!handoff) return next(new Error("Failed to create handoff"));
      res.status(201).json({ success: true, data: { handoff } });
    } catch (err) {
      next(err);
    }
  },
);

// GET /handoffs — list handoffs for this clinic (admin/owner)
router.get(
  "/",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId } = req.user!;
    try {
      const handoffs = await db
        .select()
        .from(doctorHandoffsTable)
        .where(eq(doctorHandoffsTable.clinicId, clinicId))
        .orderBy(desc(doctorHandoffsTable.createdAt))
        .limit(100);
      res.json({ success: true, data: { handoffs } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
