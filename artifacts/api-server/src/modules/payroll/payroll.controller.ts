import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { PayrollRepository } from "./payroll.repository";
import { db, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();
const repo = new PayrollRepository();

router.use(authMiddleware);

const salarySettingsSchema = z.object({
  salaryType: z.enum(["fixed", "commission", "fixed_plus_commission", "hourly"]),
  fixedAmount: z.number().min(0).default(0),
  commissionPercent: z.number().min(0).max(100).default(0),
});

const periodSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

const approveSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  employees: z.array(
    z.object({
      userId: z.string(),
      approvedAmount: z.number().min(0),
      notes: z.string().optional(),
    }),
  ).min(1),
});

router.get(
  "/settings",
  roleGuard("owner", "admin", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await repo.listSalarySettings(req.user!.clinicId);
      res.json({ success: true, data: { settings } });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/settings/:userId",
  roleGuard("owner", "admin", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = String(req.params["userId"]);
      const settings = await repo.getSalarySettings(userId, req.user!.clinicId);
      res.json({ success: true, data: { settings } });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/settings/:userId",
  roleGuard("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = String(req.params["userId"]);
      const parsed = salarySettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
      }

      const [targetUser] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, userId), eq(usersTable.clinicId, req.user!.clinicId)))
        .limit(1);

      if (!targetUser) {
        return next(new NotFoundError("User not found"));
      }

      const settings = await repo.upsertSalarySettings(userId, req.user!.clinicId, {
        salaryType: parsed.data.salaryType,
        fixedAmount: String(parsed.data.fixedAmount),
        commissionPercent: String(parsed.data.commissionPercent),
      });

      res.json({ success: true, data: { settings } });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/preview",
  roleGuard("owner", "admin", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = periodSchema.safeParse({
        year: req.query["year"],
        month: req.query["month"],
      });
      if (!parsed.success) {
        return next(new ValidationError("year and month query params are required"));
      }

      const preview = await repo.previewPayrollForPeriod(
        req.user!.clinicId,
        parsed.data.year,
        parsed.data.month,
      );

      const totalFot = preview.reduce((s, r) => s + r.calculatedAmount, 0);
      res.json({ success: true, data: { preview, totalFot } });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/approve",
  roleGuard("owner", "admin", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = approveSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
      }

      const { year, month } = parsed.data;
      const seenUserIds = new Set<string>();
      const employees = parsed.data.employees.filter((e) => {
        if (seenUserIds.has(e.userId)) return false;
        seenUserIds.add(e.userId);
        return true;
      });

      const result = await repo.approvePeriodPayroll(
        req.user!.clinicId,
        req.user!.userId,
        year,
        month,
        employees,
      );

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/records",
  roleGuard("owner", "admin", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = typeof req.query["userId"] === "string" ? req.query["userId"] : undefined;
      const year = typeof req.query["year"] === "string" ? Number(req.query["year"]) : undefined;
      const month = typeof req.query["month"] === "string" ? Number(req.query["month"]) : undefined;
      const records = await repo.listPayrollRecords(req.user!.clinicId, userId, year, month);
      res.json({ success: true, data: { records } });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/my",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const records = await repo.listPayrollRecords(req.user!.clinicId, req.user!.userId);
      res.json({ success: true, data: { records } });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/my-salary",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const salary = await repo.getMySalary(req.user!.userId, req.user!.clinicId, year, month);
      res.json({ success: true, data: salary });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
