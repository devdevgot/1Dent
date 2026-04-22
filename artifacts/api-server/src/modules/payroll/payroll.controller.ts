import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "crypto";
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
  salaryType: z.enum(["fixed", "commission", "fixed_plus_commission"]),
  fixedAmount: z.number().min(0).default(0),
  commissionPercent: z.number().min(0).max(100).default(0),
});

const calculateSchema = z.object({
  userId: z.string(),
  periodYear: z.number().int().min(2020).max(2100),
  periodMonth: z.number().int().min(1).max(12),
});

const approveSchema = z.object({
  approvedAmount: z.number().min(0),
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
  roleGuard("owner"),
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
  "/records",
  roleGuard("owner", "admin", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = typeof req.query["userId"] === "string" ? req.query["userId"] : undefined;
      const records = await repo.listPayrollRecords(req.user!.clinicId, userId);
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

router.post(
  "/calculate",
  roleGuard("owner", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = calculateSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
      }

      const { userId, periodYear, periodMonth } = parsed.data;
      const { clinicId } = req.user!;

      const existing = await repo.getExistingRecord(clinicId, userId, periodYear, periodMonth);
      if (existing) {
        return next(new ValidationError("Payroll record for this period already exists"));
      }

      const settings = await repo.getSalarySettings(userId, clinicId);
      if (!settings) {
        return next(new NotFoundError("Salary settings not found for this user. Please configure them first."));
      }

      const revenueBase = await repo.getDoctorRevenueForPeriod(userId, clinicId, periodYear, periodMonth);

      let calculatedAmount = 0;
      const fixed = Number(settings.fixedAmount);
      const commPct = Number(settings.commissionPercent);

      switch (settings.salaryType) {
        case "fixed":
          calculatedAmount = fixed;
          break;
        case "commission":
          calculatedAmount = (revenueBase * commPct) / 100;
          break;
        case "fixed_plus_commission":
          calculatedAmount = fixed + (revenueBase * commPct) / 100;
          break;
      }

      const record = await repo.createPayrollRecord({
        id: randomUUID(),
        clinicId,
        userId,
        periodMonth,
        periodYear,
        salaryType: settings.salaryType,
        fixedAmount: settings.fixedAmount,
        commissionPercent: settings.commissionPercent,
        revenueBase: String(revenueBase),
        calculatedAmount: String(Math.round(calculatedAmount)),
      });

      res.status(201).json({ success: true, data: { record } });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/approve/:id",
  roleGuard("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params["id"]);
      const parsed = approveSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
      }

      const record = await repo.getPayrollRecord(id, req.user!.clinicId);
      if (!record) {
        return next(new NotFoundError("Payroll record not found"));
      }

      const updated = await repo.approvePayrollRecord(
        id,
        req.user!.clinicId,
        req.user!.userId,
        String(parsed.data.approvedAmount),
      );

      res.json({ success: true, data: { record: updated } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
