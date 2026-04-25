import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { doctorHandoffsTable, usersTable, proceduresTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";

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
      // Verify both doctors belong to the same clinic and have the 'doctor' role,
      // and optionally verify that procedureId belongs to this clinic.
      const verifications: Promise<unknown>[] = [
        db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.id, fromDoctorId), eq(usersTable.clinicId, clinicId), eq(usersTable.role, "doctor")))
          .limit(1),
        db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.id, toDoctorId), eq(usersTable.clinicId, clinicId), eq(usersTable.role, "doctor")))
          .limit(1),
      ];

      if (procedureId) {
        verifications.push(
          db
            .select({ id: proceduresTable.id })
            .from(proceduresTable)
            .where(and(eq(proceduresTable.id, procedureId), eq(proceduresTable.clinicId, clinicId)))
            .limit(1),
        );
      }

      const [fromDoctorRows, toDoctorRows, procedureRows] = await Promise.all(verifications) as [
        Array<{ id: string }>,
        Array<{ id: string }>,
        Array<{ id: string }> | undefined,
      ];

      if (!(fromDoctorRows as Array<{ id: string }>)[0]) {
        return next(new NotFoundError("fromDoctorId not found in this clinic or is not a doctor"));
      }
      if (!(toDoctorRows as Array<{ id: string }>)[0]) {
        return next(new NotFoundError("toDoctorId not found in this clinic or is not a doctor"));
      }
      if (procedureId && !procedureRows?.[0]) {
        return next(new NotFoundError("procedureId not found in this clinic"));
      }

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
