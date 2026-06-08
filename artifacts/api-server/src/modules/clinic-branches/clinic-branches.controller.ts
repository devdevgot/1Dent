import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db, clinicsTable, usersTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";

const router = Router();
const ownerOnly = roleGuard("owner");

const createBranchSchema = z.object({
  name: z.string().min(1).max(200),
});

const updateBranchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

// GET /clinic-branches — list branch clinics for the current owner's clinic
router.get(
  "/clinic-branches",
  authMiddleware,
  ownerOnly,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user!.clinicId;

      const [parentClinic] = await db
        .select()
        .from(clinicsTable)
        .where(eq(clinicsTable.id, clinicId))
        .limit(1);

      if (!parentClinic) return next(new NotFoundError("Clinic not found"));

      const rootId = parentClinic.parentClinicId ?? clinicId;

      const branches = await db
        .select({
          id: clinicsTable.id,
          name: clinicsTable.name,
          parentClinicId: clinicsTable.parentClinicId,
          createdAt: clinicsTable.createdAt,
        })
        .from(clinicsTable)
        .where(eq(clinicsTable.parentClinicId, rootId));

      res.json({ success: true, data: { branches } });
    } catch (err) {
      next(err);
    }
  },
);

// POST /clinic-branches — create a new branch clinic
router.post(
  "/clinic-branches",
  authMiddleware,
  ownerOnly,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = createBranchSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));

    try {
      const clinicId = req.user!.clinicId;

      const [parentClinic] = await db
        .select()
        .from(clinicsTable)
        .where(eq(clinicsTable.id, clinicId))
        .limit(1);

      if (!parentClinic) return next(new NotFoundError("Clinic not found"));

      const rootId = parentClinic.parentClinicId ?? clinicId;

      const branchId = randomUUID();
      const [branch] = await db
        .insert(clinicsTable)
        .values({
          id: branchId,
          name: parsed.data.name,
          parentClinicId: rootId,
          plan: parentClinic.plan,
        })
        .returning();

      res.status(201).json({ success: true, data: { branch: { id: branch!.id, name: branch!.name, parentClinicId: branch!.parentClinicId, createdAt: branch!.createdAt } } });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /clinic-branches/:branchId — update branch name
router.patch(
  "/clinic-branches/:branchId",
  authMiddleware,
  ownerOnly,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = updateBranchSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));

    try {
      const clinicId = req.user!.clinicId;
      const branchId = req.params["branchId"] as string;
      const rootId = clinicId;

      const [branch] = await db
        .select()
        .from(clinicsTable)
        .where(and(eq(clinicsTable.id, branchId), eq(clinicsTable.parentClinicId, rootId)))
        .limit(1);

      if (!branch) return next(new NotFoundError("Branch not found"));

      const [updated] = await db
        .update(clinicsTable)
        .set({ name: parsed.data.name })
        .where(eq(clinicsTable.id, branchId))
        .returning();

      res.json({ success: true, data: { branch: { id: updated!.id, name: updated!.name, parentClinicId: updated!.parentClinicId, createdAt: updated!.createdAt } } });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /clinic-branches/:branchId — delete branch clinic
router.delete(
  "/clinic-branches/:branchId",
  authMiddleware,
  ownerOnly,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user!.clinicId;
      const branchId = req.params["branchId"] as string;
      const rootId = clinicId;

      const [branch] = await db
        .select()
        .from(clinicsTable)
        .where(and(eq(clinicsTable.id, branchId), eq(clinicsTable.parentClinicId, rootId)))
        .limit(1);

      if (!branch) return next(new NotFoundError("Branch not found"));

      await db.delete(clinicsTable).where(eq(clinicsTable.id, branchId));

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
