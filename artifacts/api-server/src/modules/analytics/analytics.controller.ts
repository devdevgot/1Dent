import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { AnalyticsRepository, type DoctorAnalyticsFilters } from "./analytics.repository";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ForbiddenError } from "../../shared/errors";
import { db, proceduresTable, procedureMaterialsTable, inventoryItemsTable, clinicExpensesTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import PdfPrinter from "pdfmake";

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

    if (role === "owner" || role === "accountant") {
      const analytics = await repo.getOwnerAnalytics(clinicId).catch(next);
      if (analytics === undefined) return;
      return res.json({ success: true, data: { role: role === "accountant" ? "accountant" : "owner", analytics } });
    }

    if (role === "admin") {
      const analytics = await repo.getAdminAnalytics(clinicId).catch(next);
      if (analytics === undefined) return;
      return res.json({ success: true, data: { role: "admin", analytics } });
    }

    if (role === "doctor") {
      const analytics = await repo.getDoctorAnalytics(clinicId, userId).catch(next);
      if (analytics === undefined) return;
      return res.json({ success: true, data: { role: "doctor", analytics } });
    }

    if (role === "warehouse") {
      const analytics = await repo.getAdminAnalytics(clinicId).catch(next);
      if (analytics === undefined) return;
      return res.json({ success: true, data: { role: "warehouse", analytics } });
    }

    return next(new ForbiddenError("Insufficient permissions"));
  },
);

// GET /analytics/owner — owner/accountant analytics
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
    const { doctorId } = req.params;
    const filters = parseAnalyticsFilters(req.query);
    const analytics = await repo.getDoctorDetailedAnalytics(clinicId, doctorId!, filters).catch(next);
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

// ─── Financial Summary ───────────────────────────────────────────────────────

router.get(
  "/analytics/financial-summary",
  roleGuard("owner", "admin", "accountant"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clinicId } = req.user!;
      const dateFrom = typeof req.query["dateFrom"] === "string" ? new Date(req.query["dateFrom"]) : undefined;
      const dateTo = typeof req.query["dateTo"] === "string" ? new Date(req.query["dateTo"] + "T23:59:59Z") : undefined;

      const procConditions: ReturnType<typeof eq>[] = [
        eq(proceduresTable.clinicId, clinicId),
        eq(proceduresTable.status, "completed"),
      ];
      if (dateFrom) procConditions.push(gte(proceduresTable.completedAt, dateFrom) as ReturnType<typeof eq>);
      if (dateTo) procConditions.push(lte(proceduresTable.completedAt, dateTo) as ReturnType<typeof eq>);

      const matConditions = [eq(proceduresTable.clinicId, clinicId)];
      if (dateFrom) matConditions.push(gte(proceduresTable.completedAt, dateFrom) as ReturnType<typeof eq>);
      if (dateTo) matConditions.push(lte(proceduresTable.completedAt, dateTo) as ReturnType<typeof eq>);

      const expConditions: ReturnType<typeof eq>[] = [eq(clinicExpensesTable.clinicId, clinicId)];
      if (dateFrom) expConditions.push(gte(clinicExpensesTable.expenseDate, dateFrom) as ReturnType<typeof eq>);
      if (dateTo) expConditions.push(lte(clinicExpensesTable.expenseDate, dateTo) as ReturnType<typeof eq>);

      const [procedures, materialRows, expenses] = await Promise.all([
        db.select({ price: proceduresTable.price }).from(proceduresTable).where(and(...procConditions)),
        db
          .select({
            totalCost: sql<number>`SUM(${procedureMaterialsTable.quantity} * ${inventoryItemsTable.unitPrice})`,
          })
          .from(procedureMaterialsTable)
          .innerJoin(proceduresTable, eq(procedureMaterialsTable.procedureId, proceduresTable.id))
          .innerJoin(inventoryItemsTable, eq(procedureMaterialsTable.inventoryItemId, inventoryItemsTable.id))
          .where(and(...matConditions)),
        db.select({ category: clinicExpensesTable.category, amount: clinicExpensesTable.amount })
          .from(clinicExpensesTable)
          .where(and(...expConditions)),
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

      res.json({
        success: true,
        data: {
          totalRevenue,
          totalMaterialCost,
          totalOperationalExpenses,
          netProfit,
          marginPct,
          expensesByCategory,
          procedureCount: procedures.length,
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
      const dateFrom = typeof req.query["dateFrom"] === "string" ? new Date(req.query["dateFrom"]) : undefined;
      const dateTo = typeof req.query["dateTo"] === "string" ? new Date(req.query["dateTo"] + "T23:59:59Z") : undefined;

      const procConditions: ReturnType<typeof eq>[] = [
        eq(proceduresTable.clinicId, clinicId),
        eq(proceduresTable.status, "completed"),
      ];
      if (dateFrom) procConditions.push(gte(proceduresTable.completedAt, dateFrom) as ReturnType<typeof eq>);
      if (dateTo) procConditions.push(lte(proceduresTable.completedAt, dateTo) as ReturnType<typeof eq>);

      const expConditions: ReturnType<typeof eq>[] = [eq(clinicExpensesTable.clinicId, clinicId)];
      if (dateFrom) expConditions.push(gte(clinicExpensesTable.expenseDate, dateFrom) as ReturnType<typeof eq>);
      if (dateTo) expConditions.push(lte(clinicExpensesTable.expenseDate, dateTo) as ReturnType<typeof eq>);

      const [procedures, materialRows, expenses] = await Promise.all([
        db.select({ name: proceduresTable.name, price: proceduresTable.price, completedAt: proceduresTable.completedAt })
          .from(proceduresTable).where(and(...procConditions)),
        db
          .select({
            totalCost: sql<number>`SUM(${procedureMaterialsTable.quantity} * ${inventoryItemsTable.unitPrice})`,
          })
          .from(procedureMaterialsTable)
          .innerJoin(proceduresTable, eq(procedureMaterialsTable.procedureId, proceduresTable.id))
          .innerJoin(inventoryItemsTable, eq(procedureMaterialsTable.inventoryItemId, inventoryItemsTable.id))
          .where(and(...procConditions)),
        db.select().from(clinicExpensesTable).where(and(...expConditions)),
      ]);

      const totalRevenue = procedures.reduce((s, p) => s + (p.price ?? 0), 0);
      const totalMaterialCost = Number(materialRows[0]?.totalCost ?? 0);
      const totalOperationalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
      const netProfit = totalRevenue - totalMaterialCost - totalOperationalExpenses;
      const marginPct = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Dental CRM";
      workbook.created = new Date();

      const summarySheet = workbook.addWorksheet("Сводка");
      summarySheet.columns = [
        { header: "Показатель", key: "label", width: 30 },
        { header: "Сумма (₸)", key: "value", width: 20 },
      ];
      summarySheet.addRow({ label: "Выручка", value: totalRevenue });
      summarySheet.addRow({ label: "Затраты на материалы", value: totalMaterialCost });
      summarySheet.addRow({ label: "Операционные расходы", value: totalOperationalExpenses });
      summarySheet.addRow({ label: "Чистая прибыль", value: netProfit });
      summarySheet.addRow({ label: "Рентабельность (%)", value: marginPct });

      summarySheet.getRow(1).font = { bold: true };
      summarySheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF98CC1C" },
      };

      const expensesSheet = workbook.addWorksheet("Расходы");
      expensesSheet.columns = [
        { header: "Дата", key: "date", width: 15 },
        { header: "Категория", key: "category", width: 18 },
        { header: "Подкатегория", key: "subcategory", width: 20 },
        { header: "Описание", key: "description", width: 35 },
        { header: "Сумма (₸)", key: "amount", width: 15 },
      ];
      expensesSheet.getRow(1).font = { bold: true };
      for (const e of expenses) {
        expensesSheet.addRow({
          date: e.expenseDate ? new Date(e.expenseDate).toLocaleDateString("ru-KZ") : "",
          category: e.category,
          subcategory: e.subcategory ?? "",
          description: e.description ?? "",
          amount: Number(e.amount),
        });
      }

      const procSheet = workbook.addWorksheet("Процедуры");
      procSheet.columns = [
        { header: "Дата", key: "date", width: 15 },
        { header: "Процедура", key: "name", width: 35 },
        { header: "Сумма (₸)", key: "price", width: 15 },
      ];
      procSheet.getRow(1).font = { bold: true };
      for (const p of procedures) {
        procSheet.addRow({
          date: p.completedAt ? new Date(p.completedAt).toLocaleDateString("ru-KZ") : "",
          name: p.name,
          price: p.price ?? 0,
        });
      }

      const fromStr = dateFrom ? dateFrom.toISOString().slice(0, 10) : "all";
      const toStr = dateTo ? dateTo.toISOString().slice(0, 10) : "all";
      const filename = `financial-report-${fromStr}-${toStr}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
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
      const dateFrom = typeof req.query["dateFrom"] === "string" ? new Date(req.query["dateFrom"]) : undefined;
      const dateTo = typeof req.query["dateTo"] === "string" ? new Date(req.query["dateTo"] + "T23:59:59Z") : undefined;

      const procConditions: ReturnType<typeof eq>[] = [
        eq(proceduresTable.clinicId, clinicId),
        eq(proceduresTable.status, "completed"),
      ];
      if (dateFrom) procConditions.push(gte(proceduresTable.completedAt, dateFrom) as ReturnType<typeof eq>);
      if (dateTo) procConditions.push(lte(proceduresTable.completedAt, dateTo) as ReturnType<typeof eq>);

      const expConditions: ReturnType<typeof eq>[] = [eq(clinicExpensesTable.clinicId, clinicId)];
      if (dateFrom) expConditions.push(gte(clinicExpensesTable.expenseDate, dateFrom) as ReturnType<typeof eq>);
      if (dateTo) expConditions.push(lte(clinicExpensesTable.expenseDate, dateTo) as ReturnType<typeof eq>);

      const [procedures, materialRows, expenses] = await Promise.all([
        db.select({ name: proceduresTable.name, price: proceduresTable.price })
          .from(proceduresTable).where(and(...procConditions)),
        db
          .select({
            totalCost: sql<number>`SUM(${procedureMaterialsTable.quantity} * ${inventoryItemsTable.unitPrice})`,
          })
          .from(procedureMaterialsTable)
          .innerJoin(proceduresTable, eq(procedureMaterialsTable.procedureId, proceduresTable.id))
          .innerJoin(inventoryItemsTable, eq(procedureMaterialsTable.inventoryItemId, inventoryItemsTable.id))
          .where(and(...procConditions)),
        db.select().from(clinicExpensesTable).where(and(...expConditions)),
      ]);

      const totalRevenue = procedures.reduce((s, p) => s + (p.price ?? 0), 0);
      const totalMaterialCost = Number(materialRows[0]?.totalCost ?? 0);
      const totalOperationalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
      const netProfit = totalRevenue - totalMaterialCost - totalOperationalExpenses;
      const marginPct = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

      const fmtMoney = (n: number) => `${n.toLocaleString("ru-KZ")} ₸`;
      const fmtDate = (d: Date | null | undefined) =>
        d ? new Date(d).toLocaleDateString("ru-KZ") : "—";
      const periodLabel = dateFrom && dateTo
        ? `${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`
        : dateFrom
        ? `с ${fmtDate(dateFrom)}`
        : dateTo
        ? `по ${fmtDate(dateTo)}`
        : "За всё время";

      const CATEGORY_LABELS: Record<string, string> = {
        salary: "Зарплата",
        materials: "Материалы",
        rent: "Аренда",
        utilities: "Коммунальные",
        equipment: "Оборудование",
        marketing: "Маркетинг",
        other: "Прочее",
      };

      const fonts = {
        Roboto: {
          normal: "Helvetica",
          bold: "Helvetica-Bold",
          italics: "Helvetica-Oblique",
          bolditalics: "Helvetica-BoldOblique",
        },
      };

      const printer = new PdfPrinter(fonts);
      const docDefinition = {
        content: [
          { text: "Финансовый отчёт", style: "title" },
          { text: periodLabel, style: "subtitle", margin: [0, 0, 0, 16] },
          { text: "Сводка", style: "sectionHeader" },
          {
            table: {
              widths: ["*", "auto"],
              body: [
                [{ text: "Показатель", bold: true }, { text: "Сумма (₸)", bold: true }],
                ["Выручка", fmtMoney(totalRevenue)],
                ["Затраты на материалы", fmtMoney(totalMaterialCost)],
                ["Операционные расходы", fmtMoney(totalOperationalExpenses)],
                [{ text: "Чистая прибыль", bold: true }, { text: fmtMoney(netProfit), bold: true }],
                ["Рентабельность", `${marginPct}%`],
              ],
            },
            margin: [0, 8, 0, 16],
          },
          ...(expenses.length > 0 ? [
            { text: "Операционные расходы", style: "sectionHeader" },
            {
              table: {
                widths: ["auto", "auto", "*", "auto"],
                body: [
                  [
                    { text: "Дата", bold: true },
                    { text: "Категория", bold: true },
                    { text: "Описание", bold: true },
                    { text: "Сумма", bold: true },
                  ],
                  ...expenses.map((e) => [
                    fmtDate(e.expenseDate),
                    CATEGORY_LABELS[e.category] ?? e.category,
                    e.description ?? "",
                    fmtMoney(Number(e.amount)),
                  ]),
                ],
              },
              margin: [0, 8, 0, 16],
            },
          ] : []),
        ],
        styles: {
          title: { fontSize: 20, bold: true, margin: [0, 0, 0, 4] },
          subtitle: { fontSize: 12, color: "#666666" },
          sectionHeader: { fontSize: 14, bold: true, margin: [0, 8, 0, 4] },
        },
        defaultStyle: { font: "Roboto", fontSize: 10 },
      };

      const fromStr = dateFrom ? dateFrom.toISOString().slice(0, 10) : "all";
      const toStr = dateTo ? dateTo.toISOString().slice(0, 10) : "all";
      const filename = `financial-report-${fromStr}-${toStr}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const pdfDoc = printer.createPdfKitDocument(docDefinition as Parameters<typeof printer.createPdfKitDocument>[0]);
      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (err) {
      next(err);
    }
  },
);

export { repo as analyticsRepo };
export default router;
