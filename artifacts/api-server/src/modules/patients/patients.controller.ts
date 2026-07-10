import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { PatientsService } from "./patients.service";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import { analyticsRepo } from "../analytics/analytics.controller";
import { parseIIN, isIINError } from "@workspace/api-zod";

const router: IRouter = Router();
const service = new PatientsService();

const patientSourceValues = [
  "instagram",
  "referral",
  "walk_in",
  "website",
  "whatsapp",
  "other",
] as const;

const patientStatusValues = [
  "new_request",
  "initial_consultation",
  "diagnostics",
  "treatment_assigned",
  "treatment_in_progress",
  "payment_processing",
  "post_op_monitoring",
  "completed",
  "repeat_sale",
  "rejected",
] as const;

const interactionTypeValues = [
  "note",
  "call",
  "whatsapp",
  "status_change",
  "appointment",
] as const;

const iinSchema = z
  .string()
  .regex(/^\d{12}$/, "ИИН должен содержать ровно 12 цифр")
  .refine((iin) => {
    const result = parseIIN(iin);
    return !isIINError(result);
  }, "ИИН не прошёл проверку контрольной суммы")
  .optional();

const createPatientSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(5),
  iin: iinSchema,
  dateOfBirth: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  source: z.string().optional(),
  doctorId: z.string().optional(),
  notes: z.string().optional(),
});

const updatePatientSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(5).optional(),
  iin: iinSchema,
  dateOfBirth: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  source: z.string().optional(),
  doctorId: z.string().optional(),
  notes: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(patientStatusValues),
});

const addInteractionSchema = z.object({
  type: z.enum(interactionTypeValues),
  content: z.string().min(1),
});

router.use(authMiddleware);

const patientReadRoles = roleGuard("owner", "admin", "doctor", "accountant", "assistant", "nurse");
const patientCreateRoles = roleGuard("owner", "admin", "doctor");
const patientWriteRoles = roleGuard("owner", "admin");
const patientDeleteRoles = roleGuard("owner", "admin");

// GET /patients — owner/admin see all, doctor sees own only (service layer)
router.get("/", patientReadRoles, async (req: Request, res: Response, next: NextFunction) => {
  const result = await service
    .list(req.user!.clinicId, req.user!.role, req.user!.userId)
    .catch(next);
  if (!result) return;
  res.json({ success: true, data: { patients: result } });
});

// POST /patients
router.post("/", patientCreateRoles, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = createPatientSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(
      new ValidationError(
        parsed.error.errors[0]?.message ?? "Validation failed",
      ),
    );
  }
  const result = await service
    .create(req.user!.clinicId, parsed.data, req.user!.role, req.user!.userId)
    .catch(next);
  if (!result) return;
  analyticsRepo.invalidateClinicCache(req.user!.clinicId).catch(() => {});
  res.status(201).json({ success: true, data: { patient: result } });
});

// GET /patients/by-iin/:iin — must be before /:id
router.get(
  "/by-iin/:iin",
  patientReadRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const iin = String(req.params["iin"]);
    if (!/^\d{12}$/.test(iin)) {
      return next(new ValidationError("ИИН должен содержать ровно 12 цифр"));
    }
    const patient = await service
      .findByIIN(req.user!.clinicId, iin, req.user!.role, req.user!.userId)
      .catch(next);
    if (patient === undefined) return;
    res.json({ success: true, data: { patient } });
  },
);

// Static paths must be registered before /:id
const aggregateReadRoles = roleGuard("owner", "admin", "doctor", "accountant");

// GET /patients/condition-stats — treatment condition breakdown
router.get(
  "/condition-stats",
  aggregateReadRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user!.clinicId;
      const { db, treatmentPlanItemsTable } = await import("@workspace/db");
      const { eq, and, ne, sql } = await import("drizzle-orm");

      const rows = await db
        .select({
          condition: treatmentPlanItemsTable.condition,
          count: sql<number>`count(distinct ${treatmentPlanItemsTable.patientId})`.as("count"),
        })
        .from(treatmentPlanItemsTable)
        .where(
          and(
            eq(treatmentPlanItemsTable.clinicId, clinicId),
            ne(treatmentPlanItemsTable.status, "cancelled"),
          ),
        )
        .groupBy(treatmentPlanItemsTable.condition);

      const stats: Record<string, number> = {};
      for (const r of rows) {
        if (r.condition && r.condition !== "healthy") {
          stats[r.condition] = Number(r.count) || 0;
        }
      }

      res.json({ success: true, data: { stats } });
    } catch (err) {
      next(err);
    }
  },
);

// GET /patients/financial-summary — per-patient treatment plan financials
router.get(
  "/financial-summary",
  aggregateReadRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user!.clinicId;

      const { db, treatmentPlanItemsTable, proceduresTable } = await import("@workspace/db");
      const { eq, and, sql } = await import("drizzle-orm");

      const pendingRows = await db
        .select({
          patientId: treatmentPlanItemsTable.patientId,
          total: sql<number>`coalesce(sum(${treatmentPlanItemsTable.price} * (1 - coalesce(${treatmentPlanItemsTable.discount}, 0) / 100.0)), 0)`.as("total"),
        })
        .from(treatmentPlanItemsTable)
        .where(
          and(
            eq(treatmentPlanItemsTable.clinicId, clinicId),
            eq(treatmentPlanItemsTable.status, "pending"),
          ),
        )
        .groupBy(treatmentPlanItemsTable.patientId);

      const paidRows = await db
        .select({
          patientId: proceduresTable.patientId,
          total: sql<number>`coalesce(sum(${proceduresTable.price}), 0)`.as("total"),
        })
        .from(proceduresTable)
        .where(
          and(
            eq(proceduresTable.clinicId, clinicId),
            eq(proceduresTable.status, "completed"),
          ),
        )
        .groupBy(proceduresTable.patientId);

      const debtRows = await db
        .select({
          patientId: proceduresTable.patientId,
          total: sql<number>`coalesce(sum(${proceduresTable.price}), 0)`.as("total"),
        })
        .from(proceduresTable)
        .where(
          and(
            eq(proceduresTable.clinicId, clinicId),
            eq(proceduresTable.paymentMethod, "debt"),
          ),
        )
        .groupBy(proceduresTable.patientId);

      const summary: Record<string, { paid: number; debt: number; remaining: number }> = {};

      for (const r of paidRows) {
        if (!summary[r.patientId]) summary[r.patientId] = { paid: 0, debt: 0, remaining: 0 };
        summary[r.patientId].paid = Number(r.total) || 0;
      }
      for (const r of debtRows) {
        if (!summary[r.patientId]) summary[r.patientId] = { paid: 0, debt: 0, remaining: 0 };
        summary[r.patientId].debt = Number(r.total) || 0;
      }
      for (const r of pendingRows) {
        if (!summary[r.patientId]) summary[r.patientId] = { paid: 0, debt: 0, remaining: 0 };
        summary[r.patientId].remaining = Number(r.total) || 0;
      }

      res.json({ success: true, data: { summary } });
    } catch (err) {
      next(err);
    }
  },
);

// GET /patients/treatment-progress — per-patient active plan progress (paid / debt / pending)
router.get(
  "/treatment-progress",
  aggregateReadRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user!.clinicId;

      const { db, treatmentPlanItemsTable, treatmentPlansTable, proceduresTable } =
        await import("@workspace/db");
      const { eq, and, ne } = await import("drizzle-orm");

      const rows = await db
        .select({
          patientId: treatmentPlanItemsTable.patientId,
          itemStatus: treatmentPlanItemsTable.status,
          price: treatmentPlanItemsTable.price,
          discount: treatmentPlanItemsTable.discount,
          paymentMethod: proceduresTable.paymentMethod,
          procedureStatus: proceduresTable.status,
        })
        .from(treatmentPlanItemsTable)
        .innerJoin(
          treatmentPlansTable,
          eq(treatmentPlanItemsTable.planId, treatmentPlansTable.id),
        )
        .leftJoin(
          proceduresTable,
          eq(treatmentPlanItemsTable.procedureId, proceduresTable.id),
        )
        .where(
          and(
            eq(treatmentPlanItemsTable.clinicId, clinicId),
            ne(treatmentPlansTable.status, "completed"),
            ne(treatmentPlansTable.status, "cancelled"),
            ne(treatmentPlanItemsTable.status, "cancelled"),
          ),
        );

      type Progress = {
        paid: number;
        debt: number;
        pending: number;
        paidCount: number;
        debtCount: number;
        pendingCount: number;
      };

      const summary: Record<string, Progress> = {};

      for (const row of rows) {
        const amount =
          Number(row.price) * (1 - (Number(row.discount) || 0) / 100);
        if (!summary[row.patientId]) {
          summary[row.patientId] = {
            paid: 0,
            debt: 0,
            pending: 0,
            paidCount: 0,
            debtCount: 0,
            pendingCount: 0,
          };
        }
        const entry = summary[row.patientId]!;

        if (row.itemStatus === "pending") {
          entry.pending += amount;
          entry.pendingCount += 1;
          continue;
        }

        if (row.itemStatus === "completed") {
          const isDebt =
            row.paymentMethod === "debt" || row.procedureStatus === "pending_payment";
          if (isDebt) {
            entry.debt += amount;
            entry.debtCount += 1;
          } else {
            entry.paid += amount;
            entry.paidCount += 1;
          }
        }
      }

      res.json({ success: true, data: { summary } });
    } catch (err) {
      next(err);
    }
  },
);

// GET /patients/:id
router.get(
  "/:id",
  patientReadRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    const result = await service
      .get(id, req.user!.clinicId, req.user!.role, req.user!.userId)
      .catch(next);
    if (!result) return;
    res.json({ success: true, data: result });
  },
);

// PUT /patients/:id
router.put(
  "/:id",
  patientWriteRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = updatePatientSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new ValidationError(
          parsed.error.errors[0]?.message ?? "Validation failed",
        ),
      );
    }
    const id = String(req.params["id"]);
    const result = await service
      .update(id, req.user!.clinicId, parsed.data, req.user!.role, req.user!.userId)
      .catch(next);
    if (!result) return;
    analyticsRepo.invalidateClinicCache(req.user!.clinicId).catch(() => {});
    res.json({ success: true, data: { patient: result } });
  },
);

// PATCH /patients/:id/status
router.patch(
  "/:id/status",
  patientWriteRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new ValidationError(
          parsed.error.errors[0]?.message ?? "Validation failed",
        ),
      );
    }
    const id = String(req.params["id"]);
    const result = await service
      .updateStatus(id, req.user!.clinicId, parsed.data.status, req.user!.role, req.user!.userId)
      .catch(next);
    if (!result) return;
    analyticsRepo.invalidateClinicCache(req.user!.clinicId).catch(() => {});
    res.json({ success: true, data: { patient: result } });
  },
);

// DELETE /patients/:id — owner/admin only
router.delete(
  "/:id",
  patientDeleteRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    try {
      await service.delete(id, req.user!.clinicId, req.user!.role);
      res.json({ success: true, message: "Patient deleted" });
    } catch (err) {
      next(err);
    }
  },
);

// POST /patients/:id/interactions
router.post(
  "/:id/interactions",
  patientWriteRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = addInteractionSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new ValidationError(
          parsed.error.errors[0]?.message ?? "Validation failed",
        ),
      );
    }
    const id = String(req.params["id"]);
    const result = await service
      .addInteraction(
        id,
        req.user!.clinicId,
        { ...parsed.data, userId: req.user!.userId },
        req.user!.role,
        req.user!.userId,
      )
      .catch(next);
    if (!result) return;
    res.status(201).json({ success: true, data: { interaction: result } });
  },
);

export default router;
