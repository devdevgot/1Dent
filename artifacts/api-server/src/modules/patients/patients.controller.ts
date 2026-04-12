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
  "post_op_monitoring",
  "completed",
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

const patientReadRoles = roleGuard("owner", "admin", "doctor");
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
router.post("/", patientWriteRoles, async (req: Request, res: Response, next: NextFunction) => {
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
