import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { AnalyticsRepository, type DoctorAnalyticsFilters, type AnalyticsDateRange } from "./analytics.repository";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ForbiddenError } from "../../shared/errors";
import {
  db,
  proceduresTable,
  procedureMaterialsTable,
  inventoryItemsTable,
  clinicExpensesTable,
  patientsTable,
  usersTable,
  treatmentPlansTable,
  treatmentPlanItemsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, inArray, type SQL } from "drizzle-orm";
import {
  loadFinancialExportData,
  buildFinancialExcel,
  buildFinancialPdf,
  exportFilename,
  parseExportFilters,
} from "./financial-export";
import { logger } from "../../shared/logger";

const router: IRouter = Router();
const repo = new AnalyticsRepository();

function parseAnalyticsFilters(query: Request["query"]): DoctorAnalyticsFilters | undefined {
  const { dateFrom, dateTo, procedureType, minRevenue } = query;
  const filters: DoctorAnalyticsFilters = {};
  let hasAny = false;

  if (typeof dateFrom === "string" && dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) { filters.dateFrom = d; hasAny = true; }
  }
  if (typeof dateTo === "string" && dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); filters.dateTo = d; hasAny = true; }
  }
  if (typeof procedureType === "string" && procedureType) {
    filters.procedureType = procedureType; hasAny = true;
  }
  if (typeof minRevenue === "string" && minRevenue) {
    const n = Number(minRevenue);
    if (!isNaN(n)) { filters.minRevenue = n; hasAny = true; }
  }

  return hasAny ? filters : undefined;
}

router.use(authMiddleware);

const ownerAdminRoles = roleGuard("owner", "admin");
const allRoles = roleGuard("owner", "admin", "doctor", "accountant", "warehouse");

// GET /analytics — role-adaptive endpoint (used by frontend)
router.get(
  "/analytics",
  allRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId, role, userId } = req.user!;
    const { dateFrom, dateTo } = parseDateRange(req.query);
    const range: AnalyticsDateRange | undefined =
      dateFrom || dateTo ? { dateFrom, dateTo } : undefined;

    if (role === "owner" || role === "accountant") {
      const analytics = await repo.getOwnerAnalytics(clinicId, range).catch(next);
      if (analytics === undefined) return;
      return res.json({ success: true, data: { role: role === "accountant" ? "accountant" : "owner", analytics } });
    }

    if (role === "admin") {
      const analytics = await repo.getAdminAnalytics(clinicId, range).catch(next);
      if (analytics === undefined) return;
      return res.json({ success: true, data: { role: "admin", analytics } });
    }

    if (role === "doctor") {
      const analytics = await repo.getDoctorAnalytics(clinicId, userId, range).catch(next);
      if (analytics === undefined) return;
      return res.json({ success: true, data: { role: "doctor", analytics } });
    }

    if (role === "warehouse") {
      const analytics = await repo.getAdminAnalytics(clinicId, range).catch(next);
      if (analytics === undefined) return;
      return res.json({ success: true, data: { role: "warehouse", analytics } });
    }

    return next(new ForbiddenError("Insufficient permissions"));
  },
);

// GET /analytics/owner — owner/accountant analytics
router.get(
  "/analytics/owner/summary",
  roleGuard("owner", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId } = req.user!;
    const { dateFrom, dateTo } = parseDateRange(req.query);
    const range: AnalyticsDateRange | undefined =
      dateFrom || dateTo ? { dateFrom, dateTo } : undefined;
    const analytics = await repo.getOwnerDashboardSummary(clinicId, range).catch(next);
    if (analytics === undefined) return;
    res.json({ success: true, data: { role: "owner", analytics } });
  },
);

router.get(
  "/analytics/owner",
  roleGuard("owner", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId } = req.user!;
    const analytics = await repo.getOwnerAnalytics(clinicId).catch(next);
    if (analytics === undefined) return;
    res.json({ success: true, data: { role: "owner", analytics } });
  },
);

// GET /analytics/admin — admin/warehouse analytics
router.get(
  "/analytics/admin",
  roleGuard("owner", "admin", "warehouse"),
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId } = req.user!;
    const analytics = await repo.getAdminAnalytics(clinicId).catch(next);
    if (analytics === undefined) return;
    res.json({ success: true, data: { role: "admin", analytics } });
  },
);

// GET /analytics/doctor — doctor's own analytics
router.get(
  "/analytics/doctor",
  roleGuard("owner", "admin", "doctor"),
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId, userId } = req.user!;
    const analytics = await repo.getDoctorAnalytics(clinicId, userId).catch(next);
    if (analytics === undefined) return;
    res.json({ success: true, data: { role: "doctor", analytics } });
  },
);

// GET /analytics/doctor/me/detailed — doctor's own detailed analytics (charts)
router.get(
  "/analytics/doctor/me/detailed",
  roleGuard("doctor"),
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId, userId } = req.user!;
    const filters = parseAnalyticsFilters(req.query);
    const analytics = await repo.getDoctorDetailedAnalytics(clinicId, userId, filters).catch(next);
    if (analytics === undefined) return;
    res.json({ success: true, data: { analytics } });
  },
);

// GET /analytics/doctor/:doctorId — detailed analytics for a specific doctor (owner/admin)
router.get(
  "/analytics/doctor/:doctorId",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId } = req.user!;
    const doctorId = String(req.params["doctorId"]);
    const filters = parseAnalyticsFilters(req.query);
    const analytics = await repo.getDoctorDetailedAnalytics(clinicId, doctorId, filters).catch(next);
    if (analytics === undefined) return;
    res.json({ success: true, data: { analytics } });
  },
);

// GET /kpi/doctors — owner/admin only
router.get(
  "/kpi/doctors",
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const { clinicId } = req.user!;
    const kpis = await repo.getDoctorKpis(clinicId).catch(next);
    if (kpis === undefined) return;
    res.json({ success: true, data: { kpis } });
  },
);

// ─── Shared helpers ───────────────────────────────────────────────────────────

function buildProcConditions(clinicId: string, dateFrom?: Date, dateTo?: Date): SQL[] {
  const conds: SQL[] = [
    eq(proceduresTable.clinicId, clinicId),
    eq(proceduresTable.status, "completed"),
  ];
  if (dateFrom) conds.push(gte(proceduresTable.completedAt, dateFrom));
  if (dateTo) conds.push(lte(proceduresTable.completedAt, dateTo));
  return conds;
}

function buildExpConditions(clinicId: string, dateFrom?: Date, dateTo?: Date): SQL[] {
  const conds: SQL[] = [eq(clinicExpensesTable.clinicId, clinicId)];
  if (dateFrom) conds.push(gte(clinicExpensesTable.expenseDate, dateFrom));
  if (dateTo) conds.push(lte(clinicExpensesTable.expenseDate, dateTo));
  return conds;
}

function parseDateRange(query: Request["query"]): { dateFrom?: Date; dateTo?: Date } {
  const rawFrom = typeof query["dateFrom"] === "string" ? query["dateFrom"] : undefined;
  const rawTo = typeof query["dateTo"] === "string" ? query["dateTo"] : undefined;
  const dateFrom = rawFrom ? new Date(rawFrom) : undefined;
  const dateTo = rawTo ? new Date(rawTo + "T23:59:59Z") : undefined;
  return {
    dateFrom: dateFrom && !isNaN(dateFrom.getTime()) ? dateFrom : undefined,
    dateTo: dateTo && !isNaN(dateTo.getTime()) ? dateTo : undefined,
  };
}

async function loadFinancialData(clinicId: string, dateFrom?: Date, dateTo?: Date) {
  const procConds = buildProcConditions(clinicId, dateFrom, dateTo);
  const expConds = buildExpConditions(clinicId, dateFrom, dateTo);

  const [procedures, materialRows, expenses] = await Promise.all([
    db
      .select({
        id: proceduresTable.id,
        name: proceduresTable.name,
        price: proceduresTable.price,
        paymentMethod: proceduresTable.paymentMethod,
        completedAt: proceduresTable.completedAt,
        patientId: proceduresTable.patientId,
        doctorId: proceduresTable.doctorId,
      })
      .from(proceduresTable)
      .where(and(...procConds)),
    db
      .select({
        totalCost: sql<number>`COALESCE(SUM(${procedureMaterialsTable.quantity} * ${inventoryItemsTable.unitPrice}), 0)`,
      })
      .from(procedureMaterialsTable)
      .innerJoin(proceduresTable, eq(procedureMaterialsTable.procedureId, proceduresTable.id))
      .innerJoin(inventoryItemsTable, eq(procedureMaterialsTable.inventoryItemId, inventoryItemsTable.id))
      .where(and(...procConds)),
    db
      .select({
        id: clinicExpensesTable.id,
        category: clinicExpensesTable.category,
        subcategory: clinicExpensesTable.subcategory,
        amount: clinicExpensesTable.amount,
        description: clinicExpensesTable.description,
        expenseDate: clinicExpensesTable.expenseDate,
      })
      .from(clinicExpensesTable)
      .where(and(...expConds)),
  ]);

  const totalRevenue = procedures.reduce((s, p) => s + (p.price ?? 0), 0);
  const totalMaterialCost = Number(materialRows[0]?.totalCost ?? 0);

  const expensesByCategory: Record<string, number> = {};
  let totalOperationalExpenses = 0;
  for (const e of expenses) {
    expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + Number(e.amount);
    totalOperationalExpenses += Number(e.amount);
  }

  const netProfit = totalRevenue - totalMaterialCost - totalOperationalExpenses;
  const marginPct = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

  return { procedures, expenses, totalRevenue, totalMaterialCost, expensesByCategory, totalOperationalExpenses, netProfit, marginPct };
}

// ─── Financial Summary ────────────────────────────────────────────────────────

router.get(
  "/analytics/financial-summary",
  roleGuard("owner", "admin", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clinicId } = req.user!;
      const { dateFrom, dateTo } = parseDateRange(req.query);
      const data = await loadFinancialData(clinicId, dateFrom, dateTo);

      res.json({
        success: true,
        data: {
          totalRevenue: data.totalRevenue,
          totalMaterialCost: data.totalMaterialCost,
          totalOperationalExpenses: data.totalOperationalExpenses,
          netProfit: data.netProfit,
          marginPct: data.marginPct,
          expensesByCategory: data.expensesByCategory,
          procedureCount: data.procedures.length,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Excel Export ─────────────────────────────────────────────────────────────

router.get(
  "/analytics/export/excel",
  roleGuard("owner", "admin", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clinicId } = req.user!;
      const filters = parseExportFilters(req.query as Record<string, unknown>);
      const data = await loadFinancialExportData(clinicId, filters);
      const buffer = await buildFinancialExcel(data);
      const filename = exportFilename(filters, "xlsx");

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(buffer));
    } catch (err) {
      logger.error({ err, clinicId: req.user?.clinicId }, "Financial Excel export failed");
      next(err);
    }
  },
);

// ─── PDF Export ───────────────────────────────────────────────────────────────

router.get(
  "/analytics/export/pdf",
  roleGuard("owner", "admin", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clinicId } = req.user!;
      const filters = parseExportFilters(req.query as Record<string, unknown>);
      const data = await loadFinancialExportData(clinicId, filters);
      const buffer = await buildFinancialPdf(data);
      const filename = exportFilename(filters, "pdf");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(buffer));
    } catch (err) {
      logger.error({ err, clinicId: req.user?.clinicId }, "Financial PDF export failed");
      next(err);
    }
  },
);

// ─── Patient Metrics (Retention, LTV, Treatment Plan Conversion) ──────────────

router.get(
  "/analytics/patient-metrics",
  roleGuard("owner", "admin", "doctor", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clinicId, role, userId } = req.user!;
      const rawDoctorId = typeof req.query["doctorId"] === "string" ? req.query["doctorId"] : undefined;
      const effectiveDoctorId = role === "doctor" ? userId : rawDoctorId;

      const { dateFrom, dateTo } = parseDateRange(req.query);

      const procConds: SQL[] = [
        eq(proceduresTable.clinicId, clinicId),
        eq(proceduresTable.status, "completed"),
      ];
      if (effectiveDoctorId) procConds.push(eq(proceduresTable.doctorId, effectiveDoctorId));
      if (dateFrom) procConds.push(gte(proceduresTable.completedAt, dateFrom));
      if (dateTo) procConds.push(lte(proceduresTable.completedAt, dateTo));

      const planConds: SQL[] = [eq(treatmentPlansTable.clinicId, clinicId)];
      if (effectiveDoctorId) planConds.push(eq(treatmentPlansTable.doctorId, effectiveDoctorId));
      if (dateFrom) planConds.push(gte(treatmentPlansTable.createdAt, dateFrom));
      if (dateTo) planConds.push(lte(treatmentPlansTable.createdAt, dateTo));

      const [completedProcs, treatmentPlans] = await Promise.all([
        db
          .select({
            id: proceduresTable.id,
            patientId: proceduresTable.patientId,
            price: proceduresTable.price,
            completedAt: proceduresTable.completedAt,
          })
          .from(proceduresTable)
          .where(and(...procConds)),
        db
          .select({ id: treatmentPlansTable.id, status: treatmentPlansTable.status })
          .from(treatmentPlansTable)
          .where(and(...planConds)),
      ]);

      // Treatment items scoped to doctor-filtered plan IDs to honour least-privilege access
      const planIds = treatmentPlans.map((p) => p.id);
      const treatmentItems =
        planIds.length > 0
          ? await db
              .select({ id: treatmentPlanItemsTable.id, procedureId: treatmentPlanItemsTable.procedureId })
              .from(treatmentPlanItemsTable)
              .where(inArray(treatmentPlanItemsTable.planId, planIds))
          : [];

      // ── Retention ──────────────────────────────────────────────────────────
      const patientProcMap = new Map<string, Date[]>();
      for (const p of completedProcs) {
        if (!p.completedAt) continue;
        const arr = patientProcMap.get(p.patientId) ?? [];
        arr.push(new Date(p.completedAt));
        patientProcMap.set(p.patientId, arr);
      }

      const totalWithProcs = patientProcMap.size;
      const returnedCount = [...patientProcMap.values()].filter((d) => d.length >= 2).length;
      const retentionRate = totalWithProcs > 0 ? Math.round((returnedCount / totalWithProcs) * 100) : 0;

      // ── Retention Cohorts (last 12 months) ─────────────────────────────────
      const now = new Date();
      const retentionCohorts = Array.from({ length: 12 }, (_, i) => {
        const offset = 11 - i;
        const cohortStart = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const cohortEnd = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999);
        const month = cohortStart.toISOString().slice(0, 7);

        const newInMonth: string[] = [];
        for (const [patientId, dates] of patientProcMap.entries()) {
          const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
          const first = sorted[0]!;
          if (first >= cohortStart && first <= cohortEnd) newInMonth.push(patientId);
        }

        const cut3m = new Date(cohortEnd); cut3m.setMonth(cut3m.getMonth() + 3);
        const cut6m = new Date(cohortEnd); cut6m.setMonth(cut6m.getMonth() + 6);
        const cut12m = new Date(cohortEnd); cut12m.setFullYear(cut12m.getFullYear() + 1);

        let ret3m = 0, ret6m = 0, ret12m = 0;
        for (const pid of newInMonth) {
          const dates = patientProcMap.get(pid)!;
          const later = dates.filter((d) => d > cohortEnd);
          if (later.some((d) => d <= cut3m)) ret3m++;
          if (later.some((d) => d <= cut6m)) ret6m++;
          if (later.some((d) => d <= cut12m)) ret12m++;
        }

        return { month, newPatients: newInMonth.length, returnedIn3m: ret3m, returnedIn6m: ret6m, returnedIn12m: ret12m };
      });

      // ── LTV ────────────────────────────────────────────────────────────────
      const patientLtvMap = new Map<string, number>();
      const patientProcCountMap = new Map<string, number>();
      for (const p of completedProcs) {
        patientLtvMap.set(p.patientId, (patientLtvMap.get(p.patientId) ?? 0) + (p.price ?? 0));
        patientProcCountMap.set(p.patientId, (patientProcCountMap.get(p.patientId) ?? 0) + 1);
      }

      const ltvArr = [...patientLtvMap.values()].sort((a, b) => a - b);
      const avgLtv = ltvArr.length > 0 ? Math.round(ltvArr.reduce((s, v) => s + v, 0) / ltvArr.length) : 0;
      const medianLtv = ltvArr.length > 0 ? Math.round(ltvArr[Math.floor(ltvArr.length / 2)]!) : 0;

      const top5 = [...patientLtvMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      let topPatientsByLtv: Array<{ id: string; name: string; totalSpent: number; procedureCount: number }> = [];
      if (top5.length > 0) {
        const top5Ids = top5.map(([id]) => id);
        const patientRows = await db
          .select({ id: patientsTable.id, name: patientsTable.name })
          .from(patientsTable)
          .where(and(eq(patientsTable.clinicId, clinicId), inArray(patientsTable.id, top5Ids)));
        const nameMap = new Map(patientRows.map((p) => [p.id, p.name]));
        topPatientsByLtv = top5.map(([id, totalSpent]) => ({
          id,
          name: nameMap.get(id) ?? "—",
          totalSpent: Math.round(totalSpent),
          procedureCount: patientProcCountMap.get(id) ?? 0,
        }));
      }

      // ── Treatment Plan Conversion ───────────────────────────────────────────
      const totalPlans = treatmentPlans.length;
      const acceptedPlans = treatmentPlans.filter(
        (p) => p.status === "approved" || p.status === "in_progress" || p.status === "completed",
      ).length;
      const treatmentPlanConversion = totalPlans > 0 ? Math.round((acceptedPlans / totalPlans) * 100) : 0;
      const totalItems = treatmentItems.length;
      const linkedItems = treatmentItems.filter((item) => item.procedureId !== null).length;
      const treatmentItemCompletion = totalItems > 0 ? Math.round((linkedItems / totalItems) * 100) : 0;

      res.json({
        success: true,
        data: {
          retentionRate,
          retentionCohorts,
          avgLtv,
          medianLtv,
          topPatientsByLtv,
          treatmentPlanConversion,
          treatmentPlanAccepted: acceptedPlans,
          treatmentPlanTotal: totalPlans,
          treatmentItemCompletion,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export { repo as analyticsRepo };
export default router;
