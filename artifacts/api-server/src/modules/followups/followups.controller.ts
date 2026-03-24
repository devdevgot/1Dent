import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db, postopFollowupsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { scheduleFollowups } from "./followup.queue";

const router: IRouter = Router();
router.use(authMiddleware);

const createFollowupsSchema = z.object({
  patientId: z.string().min(1),
  procedureId: z.string().min(1),
  patientName: z.string().optional(),
});

router.post(
  "/",
  roleGuard("owner", "admin", "doctor"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = createFollowupsSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }

    const { patientId, procedureId } = parsed.data;
    const clinicId = req.user!.clinicId;

    await scheduleFollowups({ clinicId, patientId, procedureId }).catch(next);

    const followups = await db
      .select()
      .from(postopFollowupsTable)
      .where(
        and(
          eq(postopFollowupsTable.clinicId, clinicId),
          eq(postopFollowupsTable.procedureId, procedureId),
        ),
      )
      .orderBy(desc(postopFollowupsTable.sendAt));

    res.status(201).json({ success: true, data: { followups } });
  },
);

router.get(
  "/",
  roleGuard("owner", "admin", "doctor"),
  async (req: Request, res: Response, next: NextFunction) => {
    const { procedureId, patientId } = req.query as Record<string, string | undefined>;

    const conditions = [eq(postopFollowupsTable.clinicId, req.user!.clinicId)];
    if (procedureId) conditions.push(eq(postopFollowupsTable.procedureId, procedureId));
    if (patientId) conditions.push(eq(postopFollowupsTable.patientId, patientId));

    const followups = await db
      .select()
      .from(postopFollowupsTable)
      .where(and(...conditions))
      .orderBy(desc(postopFollowupsTable.sendAt))
      .catch(next);
    if (!followups) return;

    res.json({ success: true, data: { followups } });
  },
);

router.patch(
  "/:id/cancel",
  roleGuard("owner", "admin", "doctor"),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    const clinicId = req.user!.clinicId;
    let updated: typeof postopFollowupsTable.$inferSelect | undefined;
    try {
      const rows = await db
        .update(postopFollowupsTable)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(postopFollowupsTable.id, id),
            eq(postopFollowupsTable.clinicId, clinicId),
          ),
        )
        .returning();
      updated = rows[0];
    } catch (e) {
      return next(e);
    }

    if (!updated) return next(new NotFoundError("Followup not found"));
    res.json({ success: true, data: { followup: updated } });
  },
);

export default router;
