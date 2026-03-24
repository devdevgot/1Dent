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
import type { ProcedureStatus } from "@workspace/db";

const router: IRouter = Router();
const repo = new ProceduresRepository();
const inventoryRepo = new InventoryRepository();

const procedureStatusValues = [
  "scheduled",
  "in_progress",
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
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  defaultPrice: z.number().min(0).optional(),
  materials: z.array(z.object({
    name: z.string(),
    quantity: z.number().positive(),
    unit: z.string().optional(),
  })).optional(),
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
    const templates = await repo.listTemplates(req.user!.clinicId).catch(next);
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
  const { clinicId } = req.user!;

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
      await repo.saveProcedureMaterials(procedure.id, effectiveMaterials);
    } catch (err) {
      await repo.delete(procedure.id, clinicId).catch(() => {});
      return next(new ValidationError(`Stock deduction failed: ${(err as Error).message}`));
    }
  }

  analyticsRepo.invalidateClinicCache(clinicId).catch(() => {});
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

    const procedure = await repo
      .updateStatus(id, clinicId, parsed.data.status as ProcedureStatus)
      .catch(next);
    if (!procedure) return next(new NotFoundError("Procedure not found"));

    analyticsRepo.invalidateClinicCache(clinicId).catch(() => {});
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

// POST /procedure-templates
router.post(
  "/templates",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const { materials, ...rest } = parsed.data;
    const template = await repo
      .createTemplate({
        id: randomUUID(),
        clinicId: req.user!.clinicId,
        materials: JSON.stringify(materials ?? []),
        ...rest,
      })
      .catch(next);
    if (!template) return;
    res.status(201).json({ success: true, data: { template } });
  },
);

// DELETE /procedure-templates/:id
router.delete(
  "/templates/:id",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    await repo.deleteTemplate(id, req.user!.clinicId).catch(next);
    res.json({ success: true, message: "Template deleted" });
  },
);

export default router;
