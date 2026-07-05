import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { PayrollRepository } from "../payroll/payroll.repository";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, TooManyRequestsError } from "../../shared/errors";
import { db, doctorCapacityTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { analyticsCache } from "../../shared/analytics-cache";

const router: IRouter = Router();
const authService = new AuthService();
const payrollRepo = new PayrollRepository();

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["owner", "admin", "doctor", "accountant", "warehouse", "assistant", "nurse"]),
  phone: z.string().optional(),
  position: z.string().optional(),
  specialty: z.string().optional(),
  hireDate: z.string().optional(),
  maxPatientsPerDay: z.number().int().min(1).max(50).optional(),
});

const inviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["admin", "doctor", "accountant", "warehouse", "assistant", "nurse"]),
  phone: z.string().optional(),
  position: z.string().optional(),
  specialty: z.string().optional(),
  hireDate: z.string().optional(),
  maxPatientsPerDay: z.number().int().min(1).max(50).optional(),
  salaryType: z.enum(["fixed", "commission", "fixed_plus_commission", "hourly"]).optional(),
  fixedAmount: z.number().min(0).optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  hourlyRate: z.number().min(0).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["owner", "admin", "doctor", "accountant", "warehouse", "assistant", "nurse"]).optional(),
  phone: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  specialty: z.string().optional().nullable(),
  hireDate: z.string().optional().nullable(),
  password: z.string().min(6).optional(),
});

const statusSchema = z.object({
  isActive: z.boolean(),
});

const inviteRateLimit = new Map<string, number>();
const INVITE_COOLDOWN_MS = 60_000;

router.use(authMiddleware);

router.get(
  "/",
  roleGuard("owner", "admin", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    const includeInactive = req.user?.role === "owner" && req.query["includeInactive"] === "true";
    const users = await authService.listUsers(req.user!.clinicId, includeInactive).catch(next);
    if (!users) return;
    res.json({ success: true, data: { users } });
  },
);

router.post(
  "/",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }

    const user = await authService
      .createUser({
        ...parsed.data,
        clinicId: req.user!.clinicId,
        requestingRole: req.user!.role,
      })
      .catch(next);
    if (!user) return;

    res.status(201).json({ success: true, data: { user } });
  },
);

router.post(
  "/invite",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }

    const emailKey = parsed.data.email.toLowerCase();
    const lastSent = inviteRateLimit.get(emailKey);
    if (lastSent && Date.now() - lastSent < INVITE_COOLDOWN_MS) {
      const remaining = Math.ceil((INVITE_COOLDOWN_MS - (Date.now() - lastSent)) / 1000);
      return next(new TooManyRequestsError(`Invitation already sent. Try again in ${remaining}s.`));
    }

    try {
      const { userId } = await authService.inviteUser({
        clinicId: req.user!.clinicId,
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        requestingRole: req.user!.role,
        phone: parsed.data.phone,
        position: parsed.data.position,
        specialty: parsed.data.specialty,
        hireDate: parsed.data.hireDate,
      });

      if (parsed.data.salaryType) {
        const salaryType = parsed.data.salaryType;
        const fixedAmt = salaryType === "hourly"
          ? (parsed.data.hourlyRate ?? 0)
          : (parsed.data.fixedAmount ?? 0);
        await payrollRepo.upsertSalarySettings(userId, req.user!.clinicId, {
          salaryType,
          fixedAmount: String(fixedAmt),
          commissionPercent: String(parsed.data.commissionPercent ?? 0),
        });
      }

      if (parsed.data.role === "doctor" && parsed.data.maxPatientsPerDay) {
        await db
          .insert(doctorCapacityTable)
          .values({ doctorId: userId, clinicId: req.user!.clinicId, maxPatientsPerDay: parsed.data.maxPatientsPerDay })
          .onConflictDoUpdate({
            target: doctorCapacityTable.doctorId,
            set: { maxPatientsPerDay: parsed.data.maxPatientsPerDay },
          });
      }

      inviteRateLimit.set(emailKey, Date.now());
      setTimeout(() => inviteRateLimit.delete(emailKey), INVITE_COOLDOWN_MS);

      res.status(201).json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/:id",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }

    const id = String(req.params["id"]);
    const user = await authService
      .updateUser(id, req.user!.clinicId, parsed.data, req.user!.role)
      .catch(next);
    if (!user) return;

    res.json({ success: true, data: { user } });
  },
);

router.patch(
  "/:id/status",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }

    const id = String(req.params["id"]);
    try {
      const user = await authService.updateUserStatus(
        id,
        req.user!.clinicId,
        parsed.data.isActive,
        req.user!.role,
      );
      res.json({ success: true, data: { user } });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/:id",
  roleGuard("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    try {
      await authService.deleteUser(id, req.user!.clinicId, req.user!.role);
      res.json({ success: true, message: "User deleted" });
    } catch (err) {
      next(err);
    }
  },
);

const capacitySchema = z.object({
  maxPatientsPerDay: z.number().int().min(1).max(50),
});

router.patch(
  "/:id/capacity",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = capacitySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }

    const doctorId = String(req.params["id"]);
    const { clinicId } = req.user!;

    try {
      const [targetUser] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, doctorId), eq(usersTable.clinicId, clinicId), eq(usersTable.role, "doctor")))
        .limit(1);

      if (!targetUser) {
        return next(new ValidationError("Doctor not found in this clinic"));
      }

      await db
        .insert(doctorCapacityTable)
        .values({ doctorId, clinicId, maxPatientsPerDay: parsed.data.maxPatientsPerDay })
        .onConflictDoUpdate({
          target: doctorCapacityTable.doctorId,
          set: { maxPatientsPerDay: parsed.data.maxPatientsPerDay },
        });

      await analyticsCache.invalidate(analyticsCache.key("kpi", clinicId));

      res.json({ success: true, data: { maxPatientsPerDay: parsed.data.maxPatientsPerDay } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
