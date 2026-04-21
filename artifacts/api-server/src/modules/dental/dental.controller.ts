import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { DentalRepository } from "./dental.repository";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { PatientsRepository } from "../patients/patients.repository";

const router: IRouter = Router({ mergeParams: true });
const repo = new DentalRepository();
const patientsRepo = new PatientsRepository();

const toothConditionValues = [
  "healthy",
  "cavity",
  "treated",
  "crown",
  "root_canal",
  "implant",
  "missing",
  "extraction_needed",
] as const;

const updateToothSchema = z.object({
  condition: z.enum(toothConditionValues),
  notes: z.string().optional(),
});

const addTreatmentSchema = z.object({
  description: z.string().min(1),
  type: z.enum(["treatment", "extraction"]),
  itemId: z.string().optional(),
  quantityUsed: z.number().positive().optional(),
});

router.use(authMiddleware);

const readRoles = roleGuard("owner", "admin", "doctor");
const writeRoles = roleGuard("owner", "admin", "doctor");

async function assertPatientAccess(patientId: string, clinicId: string, next: NextFunction) {
  const patient = await patientsRepo.findById(patientId, clinicId);
  if (!patient) {
    next(new NotFoundError("Patient not found"));
    return false;
  }
  return true;
}

// GET /patients/:id/teeth
router.get("/", readRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;
  const teeth = await repo.listTeeth(patientId, req.user!.clinicId).catch(next);
  if (!teeth) return;
  res.json({ success: true, data: { teeth } });
});

// PUT /patients/:id/teeth/:toothFdi
router.put("/:toothFdi", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const toothFdi = parseInt(String(req.params["toothFdi"]), 10);
  if (isNaN(toothFdi) || toothFdi < 11 || toothFdi > 48) {
    return next(new ValidationError("toothFdi must be a valid FDI tooth number (11-48)"));
  }
  const parsed = updateToothSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }
  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;
  const tooth = await repo
    .upsertTooth({
      id: randomUUID(),
      clinicId: req.user!.clinicId,
      patientId,
      toothFdi,
      condition: parsed.data.condition,
      notes: parsed.data.notes ?? null,
      updatedBy: req.user!.userId,
      updatedAt: new Date(),
    })
    .catch(next);
  if (!tooth) return;
  res.json({ success: true, data: { tooth } });
});

// GET /patients/:id/teeth/:toothFdi/treatments
router.get("/:toothFdi/treatments", readRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const toothFdi = parseInt(String(req.params["toothFdi"]), 10);
  const treatments = await repo.listTreatments(patientId, req.user!.clinicId, toothFdi).catch(next);
  if (!treatments) return;
  res.json({ success: true, data: { treatments } });
});

// POST /patients/:id/teeth/:toothFdi/treatments
router.post("/:toothFdi/treatments", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const toothFdi = parseInt(String(req.params["toothFdi"]), 10);
  if (isNaN(toothFdi) || toothFdi < 11 || toothFdi > 48) {
    return next(new ValidationError("toothFdi must be a valid FDI tooth number (11-48)"));
  }
  const parsed = addTreatmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }
  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;
  const existingTreatments = await repo.listAllTreatments(patientId, req.user!.clinicId).catch(next);
  if (!existingTreatments) return;
  const activeTreatment = existingTreatments.find((t) => t.status === "in_progress");
  if (activeTreatment) {
    return next(new ValidationError(`Finish current treatment on tooth ${activeTreatment.toothFdi} first`));
  }
  const treatment = await repo
    .addTreatment({
      id: randomUUID(),
      clinicId: req.user!.clinicId,
      patientId,
      toothFdi,
      description: parsed.data.description,
      type: parsed.data.type,
      status: "in_progress",
      itemId: parsed.data.itemId ?? null,
      quantityUsed: parsed.data.quantityUsed ?? null,
      performedBy: req.user!.userId,
      performedAt: new Date(),
    })
    .catch(next);
  if (!treatment) return;
  res.status(201).json({ success: true, data: { treatment } });
});

// PATCH /patients/:id/teeth/:toothFdi/treatments/:treatmentId
router.patch("/:toothFdi/treatments/:treatmentId", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const toothFdi = parseInt(String(req.params["toothFdi"]), 10);
  const treatmentId = String(req.params["treatmentId"]);

  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;

  const existing = await repo.findTreatment(treatmentId, req.user!.clinicId).catch(next);
  if (existing === undefined) return;
  if (existing === null) {
    return next(new NotFoundError("Treatment not found"));
  }

  if (existing.patientId !== patientId || existing.toothFdi !== toothFdi) {
    return next(new NotFoundError("Treatment not found"));
  }

  if (existing.status === "done") {
    return res.json({ success: true, data: { treatment: existing } });
  }

  const result = await repo
    .completeTreatmentAndUpdateTooth(existing, req.user!.clinicId, req.user!.userId)
    .catch(next);
  if (!result) return;

  res.json({ success: true, data: { treatment: result.completed } });
});

export default router;
