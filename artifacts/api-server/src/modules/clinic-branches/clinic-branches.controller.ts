import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db, clinicsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { pool } from "@workspace/db";
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

async function ensureParentColumn(): Promise<boolean> {
  try {
    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'clinics' AND column_name = 'parent_clinic_id'
    `);
    if (rows.length === 0) {
      await pool.query(`ALTER TABLE "clinics" ADD COLUMN "parent_clinic_id" text REFERENCES "clinics"("id") ON DELETE SET NULL`);
    }
    return true;
  } catch {
    return false;
  }
}

interface BranchRow {
  id: string;
  name: string;
  parent_clinic_id: string | null;
  created_at: string;
}

// GET /clinic-branches
router.get(
  "/clinic-branches",
  authMiddleware,
  ownerOnly,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await ensureParentColumn();
      const clinicId = req.user!.clinicId;

      const { rows } = await pool.query<BranchRow>(
        `SELECT id, name, parent_clinic_id, created_at FROM clinics WHERE parent_clinic_id = $1 ORDER BY created_at`,
        [clinicId],
      );

      const branches = rows.map((r) => ({
        id: r.id,
        name: r.name,
        parentClinicId: r.parent_clinic_id,
        createdAt: r.created_at,
      }));

      res.json({ success: true, data: { branches } });
    } catch (err) {
      next(err);
    }
  },
);

// POST /clinic-branches
router.post(
  "/clinic-branches",
  authMiddleware,
  ownerOnly,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = createBranchSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));

    try {
      await ensureParentColumn();
      const clinicId = req.user!.clinicId;

      const { rows: parentRows } = await pool.query<{ plan: string }>(
        `SELECT plan FROM clinics WHERE id = $1 LIMIT 1`,
        [clinicId],
      );
      const plan = parentRows[0]?.plan ?? "free";

      const branchId = randomUUID();
      const { rows } = await pool.query<BranchRow>(
        `INSERT INTO clinics (id, name, plan, parent_clinic_id) VALUES ($1, $2, $3, $4) RETURNING id, name, parent_clinic_id, created_at`,
        [branchId, parsed.data.name, plan, clinicId],
      );

      const branch = rows[0]!;
      res.status(201).json({
        success: true,
        data: {
          branch: {
            id: branch.id,
            name: branch.name,
            parentClinicId: branch.parent_clinic_id,
            createdAt: branch.created_at,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /clinic-branches/:branchId
router.patch(
  "/clinic-branches/:branchId",
  authMiddleware,
  ownerOnly,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = updateBranchSchema.safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.message));

    try {
      await ensureParentColumn();
      const clinicId = req.user!.clinicId;
      const branchId = req.params["branchId"] as string;

      const { rows: check } = await pool.query(
        `SELECT id FROM clinics WHERE id = $1 AND parent_clinic_id = $2 LIMIT 1`,
        [branchId, clinicId],
      );
      if (check.length === 0) return next(new NotFoundError("Branch not found"));

      const { rows } = await pool.query<BranchRow>(
        `UPDATE clinics SET name = $1 WHERE id = $2 RETURNING id, name, parent_clinic_id, created_at`,
        [parsed.data.name, branchId],
      );

      const branch = rows[0]!;
      res.json({
        success: true,
        data: {
          branch: {
            id: branch.id,
            name: branch.name,
            parentClinicId: branch.parent_clinic_id,
            createdAt: branch.created_at,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /clinic-branches/:branchId
router.delete(
  "/clinic-branches/:branchId",
  authMiddleware,
  ownerOnly,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await ensureParentColumn();
      const clinicId = req.user!.clinicId;
      const branchId = req.params["branchId"] as string;

      const { rows: check } = await pool.query(
        `SELECT id FROM clinics WHERE id = $1 AND parent_clinic_id = $2 LIMIT 1`,
        [branchId, clinicId],
      );
      if (check.length === 0) return next(new NotFoundError("Branch not found"));

      await pool.query(`DELETE FROM clinics WHERE id = $1`, [branchId]);

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
