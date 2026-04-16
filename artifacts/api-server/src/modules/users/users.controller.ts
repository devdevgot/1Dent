import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import { db, doctorCapacityTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();
const authService = new AuthService();

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["owner", "admin", "doctor", "accountant", "warehouse"]),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["owner", "admin", "doctor", "accountant", "warehouse"]).optional(),
});

router.use(authMiddleware);

router.get(
  "/",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    const users = await authService.listUsers(req.user!.clinicId).catch(next);
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
      await db
        .insert(doctorCapacityTable)
        .values({ doctorId, clinicId, maxPatientsPerDay: parsed.data.maxPatientsPerDay })
        .onConflictDoUpdate({
          target: doctorCapacityTable.doctorId,
          set: { maxPatientsPerDay: parsed.data.maxPatientsPerDay },
        });

      res.json({ success: true, data: { maxPatientsPerDay: parsed.data.maxPatientsPerDay } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
