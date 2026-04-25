import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { ProceduresRepository } from "./procedures.repository";
import { InventoryRepository } from "../inventory/inventory.repository";
import { analyticsRepo } from "../analytics/analytics.controller";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError, ForbiddenError } from "../../shared/errors";
import type { ProcedureStatus, PaymentMethod } from "@workspace/db";
import { scheduleFollowups } from "../followups/followup.queue";
import { logger } from "../../lib/logger";
import { scheduleAppointmentReminders, cancelAppointmentReminders } from "../followups/appointment-reminders.queue";
import { db, postopFollowupsTable, patientsTable, usersTable, clinicsTable, doctorKpisTable, proceduresTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();
const repo = new ProceduresRepository();
const inventoryRepo = new InventoryRepository();

/**
 * Incrementally update the doctor_kpis row for a given doctor + month.
 * Called on procedure completion or payment to keep KPI data fresh between full recomputations.
 */
async function incrementDoctorKpi(opts: {
  clinicId: string;
  doctorId: string;
  deltaRevenue: number;
  deltaProcedures: number;
}): Promise<void> {
  const { clinicId, doctorId, deltaRevenue, deltaProcedures } = opts;
  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const id = `${doctorId}:${month}`;

  await db
    .insert(doctorKpisTable)
    .values({
      id,
      clinicId,
      doctorId,
      month,
      patientsCount: 0,
      proceduresCount: deltaProcedures,
      revenueTotal: deltaRevenue,
      averageCheck: deltaRevenue > 0 && deltaProcedures > 0 ? deltaRevenue / deltaProcedures : 0,
      nps: 0,
    })
    .onConflictDoUpdate({
      target: doctorKpisTable.id,
      set: {
        proceduresCount: sql`${doctorKpisTable.proceduresCount} + ${deltaProcedures}`,
        revenueTotal: sql`${doctorKpisTable.revenueTotal} + ${deltaRevenue}`,
        averageCheck: sql`CASE WHEN ${doctorKpisTable.proceduresCount} + ${deltaProcedures} > 0 THEN (${doctorKpisTable.revenueTotal} + ${deltaRevenue}) / (${doctorKpisTable.proceduresCount} + ${deltaProcedures}) ELSE 0 END`,
        computedAt: sql`NOW()`,
      },
    });
}

const procedureStatusValues = [
  "scheduled",
  "in_progress",
  "pending_payment",
  "completed",
  "cancelled",
] as const;

const createProcedureSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().optional(),
  templateId: z.string().optional(),
  name: z.string().min(1),
  price: z.number().min(0).optional(),
  notes: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  materials: z
    .array(z.object({ itemId: z.string(), quantity: z.number().positive() }))
    .optional(),
});

const updateProcedureSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().min(0).optional(),
  notes: z.string().optional(),
  doctorId: z.string().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(procedureStatusValues),
  notes: z.string().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  defaultPrice: z.number().min(0).optional(),
  category: z.string().optional(),
  materials: z.array(z.object({
    name: z.string(),
    quantity: z.number().positive(),
    unit: z.string().optional(),
  })).optional(),
});

const updateTemplateSchema = z.object({
  defaultPrice: z.number().min(0),
});

router.use(authMiddleware);

const allRoles = roleGuard("owner", "admin", "doctor", "accountant", "warehouse");
const writeRoles = roleGuard("owner", "admin", "doctor");
const deleteRoles = roleGuard("owner", "admin");
const ownerAdminRoles = roleGuard("owner", "admin");

async function assertDoctorOwnership(
  id: string,
  clinicId: string,
  userId: string,
  role: string,
  next: NextFunction,
): Promise<boolean> {
  if (role === "owner" || role === "admin") return true;
  const proc = await repo.findById(id, clinicId).catch(next);
  if (!proc) {
    next(new NotFoundError("Procedure not found"));
    return false;
  }
  if (proc.doctorId !== userId) {
    next(new ForbiddenError("You can only modify your own procedures"));
    return false;
  }
  return true;
}

// GET /procedures
router.get("/", allRoles, async (req: Request, res: Response, next: NextFunction) => {
  const { clinicId, role, userId } = req.user!;
  const doctorId = role === "doctor" ? userId : undefined;
  const procedures = await repo.list(clinicId, doctorId).catch(next);
  if (procedures === undefined) return;
  res.json({ success: true, data: { procedures } });
});

// GET /procedures/templates (MUST be before /:id)
router.get(
  "/templates",
  allRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const category = typeof req.query["category"] === "string" ? req.query["category"] : undefined;
    const templates = await repo.listTemplates(req.user!.clinicId, category).catch(next);
    if (!templates) return;
    res.json({ success: true, data: { templates } });
  },
);

// POST /procedures
router.post("/", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = createProcedureSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }

  const { materials, scheduledAt, templateId, ...rest } = parsed.data;
  const { clinicId, role, userId } = req.user!;

  // Doctors can only create procedures assigned to themselves
  if (role === "doctor") {
    rest.doctorId = userId;
  }

  // If templateId given, load template defaults (name/price override explicit fields if not provided)
  let resolvedName = rest.name;
  let resolvedPrice = rest.price;
  let templateMaterials: { itemId: string; quantity: number }[] = [];

  if (templateId) {
    const template = await repo.findTemplateById(templateId, clinicId).catch(next);
    if (!template) return next(new NotFoundError("Procedure template not found"));
    if (!rest.name || rest.name === template.name) resolvedName = template.name;
    if (resolvedPrice == null && template.defaultPrice != null) resolvedPrice = template.defaultPrice;

    // Parse template materials and map to inventory item IDs by name
    let rawMaterials: { name: string; quantity: number; unit?: string }[] = [];
    try {
      rawMaterials = JSON.parse(String(template.materials)) as { name: string; quantity: number; unit?: string }[];
    } catch {
      rawMaterials = [];
    }
    if (rawMaterials.length > 0) {
      const names = rawMaterials.map((m) => m.name);
      const inventoryMatches = await repo.findInventoryItemsByNames(names, clinicId).catch(() => []);
      const nameToId = new Map(inventoryMatches.map((item) => [item.name.toLowerCase(), item.id]));
      templateMaterials = rawMaterials
        .map((m) => ({ itemId: nameToId.get(m.name.toLowerCase()) ?? "", quantity: m.quantity }))
        .filter((m) => m.itemId !== "");
    }
  }

  // Materials from request take precedence over template materials
  const effectiveMaterials = (materials && materials.length > 0) ? materials : templateMaterials;

  // Pre-validate ALL materials before any DB writes — prevents partial stock deduction
  if (effectiveMaterials.length > 0) {
    const validationError = await inventoryRepo.validateMaterials(clinicId, effectiveMaterials).then(() => null).catch((e) => e);
    if (validationError) {
      return next(new ValidationError(`Material validation failed: ${(validationError as Error).message}`));
    }
  }

  const procedure = await repo
    .create({
      id: randomUUID(),
      clinicId,
      ...rest,
      name: resolvedName,
      price: resolvedPrice,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    })
    .catch(next);
  if (!procedure) return;

  if (effectiveMaterials.length > 0) {
    try {
      await inventoryRepo.deductMaterials(clinicId, effectiveMaterials);
      try {
        await repo.saveProcedureMaterials(procedure.id, effectiveMaterials);
      } catch (saveErr) {
        // Compensate: restore stock since deduction already occurred
        await inventoryRepo.restoreStock(clinicId, effectiveMaterials).catch(() => {});
        await repo.delete(procedure.id, clinicId).catch(() => {});
        return next(new ValidationError(`Failed to save procedure materials: ${(saveErr as Error).message}`));
      }
    } catch (err) {
      await repo.delete(procedure.id, clinicId).catch(() => {});
      return next(new ValidationError(`Stock deduction failed: ${(err as Error).message}`));
    }
  }

  analyticsRepo.invalidateClinicCache(clinicId).catch(() => {});

  if (scheduledAt && procedure.patientId) {
    const scheduledDate = new Date(scheduledAt);
    Promise.all([
      db.select({ name: patientsTable.name }).from(patientsTable).where(eq(patientsTable.id, procedure.patientId)).limit(1),
      procedure.doctorId
        ? db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, procedure.doctorId)).limit(1)
        : Promise.resolve([]),
      db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1),
    ]).then(([patients, doctors, clinics]) => {
      const patientName = patients[0]?.name ?? "Пациент";
      const doctorName = (doctors as Array<{ name: string }>)[0]?.name ?? "";
      const clinicName = clinics[0]?.name ?? "";
      return scheduleAppointmentReminders({
        clinicId,
        patientId: procedure.patientId,
        procedureId: procedure.id,
        scheduledAt: scheduledDate,
        patientName,
        procedureName: procedure.name,
        doctorName,
        clinicName,
      });
    }).catch(() => {});
  }

  res.status(201).json({ success: true, data: { procedure } });
});

// PATCH /procedures/:id/status (MUST be before /:id)
router.patch(
  "/:id/status",
  writeRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const id = String(req.params["id"]);
    const { clinicId, role, userId } = req.user!;

    const authorized = await assertDoctorOwnership(id, clinicId, userId, role, next);
    if (!authorized) return;

    // Read the old status before updating to compute KPI deltas idempotently
    const [prevProcedure] = await db
      .select({ status: proceduresTable.status, price: proceduresTable.price, doctorId: proceduresTable.doctorId })
      .from(proceduresTable)
      .where(and(eq(proceduresTable.id, id), eq(proceduresTable.clinicId, clinicId)))
      .limit(1);
    const previousStatus = prevProcedure?.status;

    const statusUpdate = parsed.data.status as ProcedureStatus;
    const procedure = await repo
      .updateStatus(id, clinicId, statusUpdate, parsed.data.notes)
      .catch(next);
    if (!procedure) return next(new NotFoundError("Procedure not found"));

    analyticsRepo.invalidateClinicCache(clinicId).catch(() => {});

    // Feedback loop: on first transition to "completed", increment proceduresCount + revenue once.
    // Gated on previousStatus to prevent double-counting if status is set to "completed" twice.
    const isFirstCompletion = parsed.data.status === "completed" && previousStatus !== "completed";
    if (isFirstCompletion && procedure.doctorId) {
      incrementDoctorKpi({
        clinicId,
        doctorId: procedure.doctorId,
        deltaRevenue: procedure.price ?? 0,
        deltaProcedures: 1,
      }).catch((err) => logger.error({ err }, "[Procedures] Failed to increment doctor KPI on completion"));
    }

    if ((parsed.data.status === "completed" || parsed.data.status === "pending_payment") && procedure.patientId) {
      const [existing] = await db
        .select({ id: postopFollowupsTable.id })
        .from(postopFollowupsTable)
        .where(
          and(
            eq(postopFollowupsTable.procedureId, procedure.id),
            eq(postopFollowupsTable.clinicId, clinicId),
          ),
        )
        .limit(1);

      if (!existing) {
        scheduleFollowups({
          clinicId,
          patientId: procedure.patientId,
          procedureId: procedure.id,
        }).catch(() => {});
      }
    }

    res.json({ success: true, data: { procedure } });
  },
);

const paymentMethodValues = ["kaspi_transfer", "cash", "kaspi_qr", "terminal", "kaspi_red", "debt"] as const;

// PATCH /procedures/:id/payment — admin/owner marks how patient paid
router.patch(
  "/:id/payment",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = z.object({ paymentMethod: z.enum(paymentMethodValues) }).safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const id = String(req.params["id"]);
    const { clinicId } = req.user!;

    // Read current status before payment update to determine if revenue was already counted.
    // If the procedure was already "completed", revenue was counted at status transition.
    // If it was "pending_payment" or other, revenue must be counted here.
    const [prevPayment] = await db
      .select({ status: proceduresTable.status, doctorId: proceduresTable.doctorId, price: proceduresTable.price })
      .from(proceduresTable)
      .where(and(eq(proceduresTable.id, id), eq(proceduresTable.clinicId, clinicId)))
      .limit(1);
    const wasAlreadyCompleted = prevPayment?.status === "completed";

    const procedure = await repo.updatePayment(id, clinicId, parsed.data.paymentMethod as PaymentMethod).catch(next);
    if (!procedure) return next(new NotFoundError("Procedure not found"));

    analyticsRepo.invalidateClinicCache(clinicId).catch(() => {});

    // Feedback loop: increment revenue only if not already counted at completion.
    // Also count proceduresCount if payment is the terminal step (status was pending_payment).
    if (procedure.doctorId && procedure.price && !wasAlreadyCompleted) {
      incrementDoctorKpi({
        clinicId,
        doctorId: procedure.doctorId,
        deltaRevenue: procedure.price,
        deltaProcedures: prevPayment?.status === "pending_payment" ? 1 : 0,
      }).catch((err) => logger.error({ err }, "[Procedures] Failed to increment doctor KPI on payment"));
    }

    res.json({ success: true, data: { procedure } });
  },
);

// PUT /procedures/:id
router.put(
  "/:id",
  writeRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = updateProcedureSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const id = String(req.params["id"]);
    const { clinicId, role, userId } = req.user!;

    const authorized = await assertDoctorOwnership(id, clinicId, userId, role, next);
    if (!authorized) return;

    const { scheduledAt, ...rest } = parsed.data;
    const procedure = await repo
      .update(id, clinicId, {
        ...rest,
        doctorId: rest.doctorId as string | null | undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : scheduledAt === null ? null : undefined,
      })
      .catch(next);
    if (!procedure) return next(new NotFoundError("Procedure not found"));

    analyticsRepo.invalidateClinicCache(clinicId).catch(() => {});

    if (scheduledAt !== undefined && procedure.patientId) {
      cancelAppointmentReminders(procedure.id, clinicId).catch(() => {});

      if (scheduledAt) {
        const scheduledDate = new Date(scheduledAt);
        Promise.all([
          db.select({ name: patientsTable.name }).from(patientsTable).where(eq(patientsTable.id, procedure.patientId)).limit(1),
          procedure.doctorId
            ? db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, procedure.doctorId)).limit(1)
            : Promise.resolve([]),
          db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1),
        ]).then(([patients, doctors, clinics]) => {
          const patientName = patients[0]?.name ?? "Пациент";
          const doctorName = (doctors as Array<{ name: string }>)[0]?.name ?? "";
          const clinicName = clinics[0]?.name ?? "";
          return scheduleAppointmentReminders({
            clinicId,
            patientId: procedure.patientId,
            procedureId: procedure.id,
            scheduledAt: scheduledDate,
            patientName,
            procedureName: procedure.name,
            doctorName,
            clinicName,
          });
        }).catch(() => {});
      }
    }

    res.json({ success: true, data: { procedure } });
  },
);

// DELETE /procedures/:id
router.delete(
  "/:id",
  deleteRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    const { clinicId } = req.user!;
    await repo.delete(id, clinicId).catch(next);
    analyticsRepo.invalidateClinicCache(clinicId).catch(() => {});
    res.json({ success: true, message: "Procedure deleted" });
  },
);

// POST /procedures/templates — owner only
router.post(
  "/templates",
  roleGuard("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const { materials, category, ...rest } = parsed.data;
    const template = await repo
      .createTemplate({
        id: randomUUID(),
        clinicId: req.user!.clinicId,
        materials: JSON.stringify(materials ?? []),
        category: category ?? "other",
        ...rest,
      })
      .catch(next);
    if (!template) return;
    res.status(201).json({ success: true, data: { template } });
  },
);

// PATCH /procedures/templates/:id — owner only, update price/name
router.patch(
  "/templates/:id",
  roleGuard("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const id = String(req.params["id"]);
    const template = await repo.updateTemplate(id, req.user!.clinicId, parsed.data).catch(next);
    if (!template) return next(new NotFoundError("Template not found"));
    res.json({ success: true, data: { template } });
  },
);

// DELETE /procedures/templates/:id — owner only
router.delete(
  "/templates/:id",
  roleGuard("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    await repo.deleteTemplate(id, req.user!.clinicId).catch(next);
    res.json({ success: true, message: "Template deleted" });
  },
);

export default router;
