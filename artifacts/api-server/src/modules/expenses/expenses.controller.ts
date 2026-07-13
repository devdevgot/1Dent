import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError, ForbiddenError } from "../../shared/errors";
import { ExpensesRepository } from "./expenses.repository";

const router: IRouter = Router();
const repo = new ExpensesRepository();

router.use(authMiddleware);

const expenseCategoryValues = ["salary", "materials", "rent", "utilities", "equipment", "marketing", "other"] as const;

const createExpenseSchema = z.object({
  category: z.enum(expenseCategoryValues),
  subcategory: z.string().max(100).optional(),
  amount: z.number().positive(),
  description: z.string().max(500).optional(),
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$|^\d{4}-\d{2}-\d{2}T/)
    .refine((v) => {
      const d = new Date(v);
      return !isNaN(d.getTime()) && d <= new Date();
    }, "Expense date cannot be in the future"),
  periodMonth: z.number().int().min(1).max(12).optional(),
  periodYear: z.number().int().min(2020).max(2100).optional(),
});

const updateExpenseSchema = createExpenseSchema.partial();

const canRead = roleGuard("owner", "admin", "accountant");
const canCreate = roleGuard("owner", "admin", "accountant");
const canWrite = roleGuard("owner", "admin");

router.get(
  "/expenses",
  (req: Request, res: Response, next: NextFunction) => {
    const { role, userId } = req.user!;
    const subcategory = typeof req.query["subcategory"] === "string" ? req.query["subcategory"] : undefined;
    if (role === "owner" || role === "admin" || role === "accountant") {
      return next();
    }
    if (subcategory === `аванс:${userId}`) {
      return next();
    }
    return next(new ForbiddenError("Insufficient permissions"));
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clinicId, role, userId } = req.user!;
      const dateFrom = typeof req.query["dateFrom"] === "string" ? new Date(req.query["dateFrom"]) : undefined;
      const dateTo = typeof req.query["dateTo"] === "string" ? new Date(req.query["dateTo"] + "T23:59:59Z") : undefined;
      const category = typeof req.query["category"] === "string" ? req.query["category"] : undefined;
      let subcategory = typeof req.query["subcategory"] === "string" ? req.query["subcategory"] : undefined;
      const periodMonth = typeof req.query["periodMonth"] === "string" ? Number(req.query["periodMonth"]) : undefined;
      const periodYear = typeof req.query["periodYear"] === "string" ? Number(req.query["periodYear"]) : undefined;

      if (role !== "owner" && role !== "admin" && role !== "accountant") {
        subcategory = `аванс:${userId}`;
      }

      const expenses = await repo.listExpenses(clinicId, {
        dateFrom: dateFrom && !isNaN(dateFrom.getTime()) ? dateFrom : undefined,
        dateTo: dateTo && !isNaN(dateTo.getTime()) ? dateTo : undefined,
        category,
        subcategory,
        periodMonth,
        periodYear,
      });
      res.json({ success: true, data: { expenses } });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/expenses/:id",
  canRead,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clinicId } = req.user!;
      const id = String(req.params["id"]);
      const expense = await repo.getExpenseById(id, clinicId);
      if (!expense) return next(new NotFoundError("Expense not found"));
      res.json({ success: true, data: { expense } });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/expenses",
  canCreate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clinicId, userId } = req.user!;
      const parsed = createExpenseSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
      }
      const d = parsed.data;
      const expense = await repo.createExpense(clinicId, userId, {
        category: d.category,
        subcategory: d.subcategory,
        amount: d.amount,
        description: d.description,
        expenseDate: new Date(d.expenseDate),
        periodMonth: d.periodMonth,
        periodYear: d.periodYear,
      });
      res.status(201).json({ success: true, data: { expense } });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/expenses/:id",
  canWrite,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clinicId } = req.user!;
      const id = String(req.params["id"]);
      const parsed = updateExpenseSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
      }
      const d = parsed.data;
      const expense = await repo.updateExpense(id, clinicId, {
        category: d.category,
        subcategory: d.subcategory,
        amount: d.amount,
        description: d.description,
        expenseDate: d.expenseDate ? new Date(d.expenseDate) : undefined,
        periodMonth: d.periodMonth,
        periodYear: d.periodYear,
      });
      if (!expense) return next(new NotFoundError("Expense not found"));
      res.json({ success: true, data: { expense } });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/expenses/:id",
  canWrite,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clinicId } = req.user!;
      const id = String(req.params["id"]);
      const expense = await repo.deleteExpense(id, clinicId);
      if (!expense) return next(new NotFoundError("Expense not found"));
      res.json({ success: true, data: { expense } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
