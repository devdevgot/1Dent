import ExcelJS from "exceljs";
import { createRequire } from "module";
import path from "path";
import {
  db,
  proceduresTable,
  procedureMaterialsTable,
  inventoryItemsTable,
  clinicExpensesTable,
  patientsTable,
  usersTable,
  clinicsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc, type SQL } from "drizzle-orm";
import { logger } from "../../shared/logger";

const _require = createRequire(import.meta.url);
const _pdfmakeDir = path.dirname(_require.resolve("pdfmake/package.json"));
const _fontsDir = path.join(_pdfmakeDir, "fonts", "Roboto");

interface PdfmakeInstance {
  fonts: Record<string, Record<string, string>>;
  setUrlAccessPolicy(fn: ((url: string) => boolean) | undefined): void;
  createPdf(docDef: unknown): { getBuffer(): Promise<Buffer> };
}

function getPdfInstance(): PdfmakeInstance {
  const instance = _require("pdfmake") as PdfmakeInstance;
  instance.fonts = {
    Roboto: {
      normal: path.join(_fontsDir, "Roboto-Regular.ttf"),
      bold: path.join(_fontsDir, "Roboto-Medium.ttf"),
      italics: path.join(_fontsDir, "Roboto-Italic.ttf"),
      bolditalics: path.join(_fontsDir, "Roboto-MediumItalic.ttf"),
    },
  };
  instance.setUrlAccessPolicy(() => false);
  return instance;
}

export interface FinancialExportFilters {
  dateFrom?: Date;
  dateTo?: Date;
  doctorId?: string;
  status?: string;
}

export function parseExportFilters(query: Record<string, unknown>): FinancialExportFilters {
  const rawFrom = typeof query["dateFrom"] === "string" ? query["dateFrom"] : undefined;
  const rawTo = typeof query["dateTo"] === "string" ? query["dateTo"] : undefined;
  const dateFrom = rawFrom ? new Date(rawFrom) : undefined;
  const dateTo = rawTo ? new Date(rawTo + "T23:59:59Z") : undefined;
  const doctorId = typeof query["doctorId"] === "string" && query["doctorId"] ? query["doctorId"] : undefined;
  const status = typeof query["status"] === "string" ? query["status"] : "completed";

  return {
    dateFrom: dateFrom && !isNaN(dateFrom.getTime()) ? dateFrom : undefined,
    dateTo: dateTo && !isNaN(dateTo.getTime()) ? dateTo : undefined,
    doctorId,
    status: status || undefined,
  };
}

const PAYMENT_LABELS: Record<string, string> = {
  kaspi_transfer: "Kaspi перевод",
  cash: "Наличные",
  kaspi_qr: "Kaspi QR",
  terminal: "Терминал",
  kaspi_red: "Kaspi RED",
  debt: "В долг",
};

const CATEGORY_LABELS: Record<string, string> = {
  salary: "Зарплата",
  materials: "Материалы",
  rent: "Аренда",
  utilities: "Коммунальные",
  equipment: "Оборудование",
  marketing: "Маркетинг",
  other: "Прочее",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Запланировано",
  in_progress: "В работе",
  pending_payment: "Ожидает оплаты",
  completed: "Завершено",
  cancelled: "Отменено",
};

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("ru-KZ");
  } catch {
    return String(d);
  }
}

function fmtMoney(n: number): string {
  return `${n.toLocaleString("ru-KZ")} ₸`;
}

/** Same filters as GET /analytics/financial-summary (proven in production). */
function buildSummaryProcConditions(clinicId: string, dateFrom?: Date, dateTo?: Date): SQL[] {
  const conds: SQL[] = [
    eq(proceduresTable.clinicId, clinicId),
    eq(proceduresTable.status, "completed"),
  ];
  if (dateFrom) conds.push(gte(proceduresTable.completedAt, dateFrom));
  if (dateTo) conds.push(lte(proceduresTable.completedAt, dateTo));
  return conds;
}

function buildProcConditions(clinicId: string, filters: FinancialExportFilters): SQL[] {
  const status = filters.status ?? "completed";

  // Default export = same query as financial-summary
  if (status === "completed" && !filters.doctorId) {
    return buildSummaryProcConditions(clinicId, filters.dateFrom, filters.dateTo);
  }

  const conds: SQL[] = [eq(proceduresTable.clinicId, clinicId)];
  conds.push(eq(proceduresTable.status, status as "completed"));
  if (filters.doctorId) {
    conds.push(eq(proceduresTable.doctorId, filters.doctorId));
  }

  const dateCol = status === "completed" ? proceduresTable.completedAt : proceduresTable.scheduledAt;
  if (filters.dateFrom) conds.push(gte(dateCol, filters.dateFrom));
  if (filters.dateTo) conds.push(lte(dateCol, filters.dateTo));
  return conds;
}

function buildExpConditions(clinicId: string, dateFrom?: Date, dateTo?: Date): SQL[] {
  const conds: SQL[] = [eq(clinicExpensesTable.clinicId, clinicId)];
  if (dateFrom) conds.push(gte(clinicExpensesTable.expenseDate, dateFrom));
  if (dateTo) conds.push(lte(clinicExpensesTable.expenseDate, dateTo));
  return conds;
}

export interface FinancialExportData {
  clinicName: string;
  periodLabel: string;
  filters: FinancialExportFilters;
  procedures: Array<{
    id: string;
    name: string;
    price: number | null;
    paymentMethod: string | null;
    status: string;
    scheduledAt: Date | null;
    completedAt: Date | null;
    notes: string | null;
    patientId: string;
    doctorId: string | null;
  }>;
  expenses: Array<{
    id: string;
    category: string;
    subcategory: string | null;
    amount: string | number;
    description: string | null;
    expenseDate: Date | null;
  }>;
  consumption: Array<{
    itemName: string;
    unit: string | null;
    totalQuantity: number;
    unitPrice: number | null;
    procedureCount: number;
    totalCost: number;
  }>;
  patientMap: Map<string, string>;
  doctorMap: Map<string, string>;
  totalRevenue: number;
  totalMaterialCost: number;
  totalOperationalExpenses: number;
  netProfit: number;
  marginPct: number;
  expensesByCategory: Record<string, number>;
  revenueByDoctor: Array<{ name: string; count: number; total: number }>;
}

export async function loadFinancialExportData(
  clinicId: string,
  filters: FinancialExportFilters,
): Promise<FinancialExportData> {
  const procConds = buildProcConditions(clinicId, filters);
  const expConds = buildExpConditions(clinicId, filters.dateFrom, filters.dateTo);

  const [clinicRow, procedures, expenses] = await Promise.all([
    db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1),
    db
      .select({
        id: proceduresTable.id,
        name: proceduresTable.name,
        price: proceduresTable.price,
        paymentMethod: proceduresTable.paymentMethod,
        status: proceduresTable.status,
        scheduledAt: proceduresTable.scheduledAt,
        completedAt: proceduresTable.completedAt,
        notes: proceduresTable.notes,
        patientId: proceduresTable.patientId,
        doctorId: proceduresTable.doctorId,
      })
      .from(proceduresTable)
      .where(and(...procConds))
      .orderBy(desc(proceduresTable.completedAt)),
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
      .where(and(...expConds))
      .orderBy(desc(clinicExpensesTable.expenseDate)),
  ]);

  let totalMaterialCost = 0;
  let consumption: FinancialExportData["consumption"] = [];
  try {
    const [materialRows, consumptionRows] = await Promise.all([
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
          itemName: inventoryItemsTable.name,
          unit: inventoryItemsTable.unit,
          unitPrice: inventoryItemsTable.unitPrice,
          totalQuantity: sql<number>`COALESCE(SUM(${procedureMaterialsTable.quantity}), 0)`.as("total_quantity"),
          procedureCount: sql<number>`COUNT(DISTINCT ${procedureMaterialsTable.procedureId})`.as("procedure_count"),
        })
        .from(procedureMaterialsTable)
        .innerJoin(proceduresTable, eq(procedureMaterialsTable.procedureId, proceduresTable.id))
        .innerJoin(inventoryItemsTable, eq(procedureMaterialsTable.inventoryItemId, inventoryItemsTable.id))
        .where(and(...procConds))
        .groupBy(
          procedureMaterialsTable.inventoryItemId,
          inventoryItemsTable.name,
          inventoryItemsTable.unit,
          inventoryItemsTable.unitPrice,
        )
        .orderBy(desc(sql`SUM(${procedureMaterialsTable.quantity})`)),
    ]);
    totalMaterialCost = Number(materialRows[0]?.totalCost ?? 0);
    consumption = consumptionRows.map((r) => ({
      itemName: r.itemName,
      unit: r.unit,
      totalQuantity: Number(r.totalQuantity ?? 0),
      unitPrice: r.unitPrice,
      procedureCount: Number(r.procedureCount ?? 0),
      totalCost: Number(r.totalQuantity ?? 0) * Number(r.unitPrice ?? 0),
    }));
  } catch (err) {
    logger.warn({ err, clinicId }, "Financial export: materials query failed, continuing without materials sheet");
  }

  const [patientRows, doctorRows] = await Promise.all([
    db.select({ id: patientsTable.id, name: patientsTable.name }).from(patientsTable).where(eq(patientsTable.clinicId, clinicId)),
    db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.clinicId, clinicId)),
  ]);

  const patientMap = new Map(patientRows.map((p) => [p.id, p.name]));
  const doctorMap = new Map(doctorRows.map((d) => [d.id, d.name]));

  const totalRevenue = procedures.reduce((s, p) => s + (p.price ?? 0), 0);

  const expensesByCategory: Record<string, number> = {};
  let totalOperationalExpenses = 0;
  for (const e of expenses) {
    expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + Number(e.amount);
    totalOperationalExpenses += Number(e.amount);
  }

  const netProfit = totalRevenue - totalMaterialCost - totalOperationalExpenses;
  const marginPct = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

  const doctorTotals = new Map<string, { name: string; count: number; total: number }>();
  for (const p of procedures) {
    const key = p.doctorId ?? "unassigned";
    const name = p.doctorId ? (doctorMap.get(p.doctorId) ?? "—") : "Не назначен";
    const row = doctorTotals.get(key) ?? { name, count: 0, total: 0 };
    row.count += 1;
    row.total += p.price ?? 0;
    doctorTotals.set(key, row);
  }
  const revenueByDoctor = [...doctorTotals.values()].sort((a, b) => b.total - a.total);

  const periodLabel =
    filters.dateFrom && filters.dateTo
      ? `${fmtDate(filters.dateFrom)} — ${fmtDate(filters.dateTo)}`
      : filters.dateFrom
        ? `с ${fmtDate(filters.dateFrom)}`
        : filters.dateTo
          ? `по ${fmtDate(filters.dateTo)}`
          : "За всё время";

  return {
    clinicName: clinicRow[0]?.name ?? "1Dent",
    periodLabel,
    filters,
    procedures,
    expenses,
    consumption,
    patientMap,
    doctorMap,
    totalRevenue,
    totalMaterialCost,
    totalOperationalExpenses,
    netProfit,
    marginPct,
    expensesByCategory,
    revenueByDoctor,
  };
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
  row.commit();
}

function addTotalRow(ws: ExcelJS.Worksheet, labelCol: number, amountCol: number, total: number) {
  const row = ws.addRow({});
  row.getCell(labelCol).value = "ИТОГО";
  row.getCell(labelCol).font = { bold: true };
  row.getCell(amountCol).value = total;
  row.getCell(amountCol).font = { bold: true };
  row.getCell(amountCol).numFmt = "#,##0";
}

export async function buildFinancialExcel(data: FinancialExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "1Dent CRM";
  workbook.created = new Date();

  // ── Sheet 1: Сводка ────────────────────────────────────────────────────────
  const summary = workbook.addWorksheet("Сводка");
  summary.addRow(["Клиника", data.clinicName]);
  summary.addRow(["Период", data.periodLabel]);
  summary.addRow([]);
  summary.addRow(["Показатель", "Сумма (₸)", "%"]);
  summary.getRow(4).font = { bold: true };
  summary.addRow(["Выручка", data.totalRevenue, "100%"]);
  summary.addRow([
    "Затраты на материалы",
    data.totalMaterialCost,
    data.totalRevenue > 0 ? `${Math.round((data.totalMaterialCost / data.totalRevenue) * 100)}%` : "—",
  ]);
  summary.addRow([
    "Операционные расходы",
    data.totalOperationalExpenses,
    data.totalRevenue > 0 ? `${Math.round((data.totalOperationalExpenses / data.totalRevenue) * 100)}%` : "—",
  ]);
  summary.addRow(["Чистая прибыль", data.netProfit, `${data.marginPct}%`]);
  summary.columns = [{ width: 32 }, { width: 18 }, { width: 12 }];
  summary.getColumn(2).numFmt = "#,##0";

  // ── Sheet 2: Доходы (процедуры) ────────────────────────────────────────────
  const income = workbook.addWorksheet("Доходы");
  income.columns = [
    { header: "№", key: "num", width: 6 },
    { header: "Дата завершения", key: "completedAt", width: 16 },
    { header: "Дата записи", key: "scheduledAt", width: 16 },
    { header: "Пациент", key: "patient", width: 28 },
    { header: "Врач", key: "doctor", width: 24 },
    { header: "Услуга", key: "service", width: 36 },
    { header: "Статус", key: "status", width: 16 },
    { header: "Способ оплаты", key: "payment", width: 18 },
    { header: "Сумма (₸)", key: "amount", width: 14 },
    { header: "Примечания", key: "notes", width: 30 },
  ];
  styleHeader(income);
  data.procedures.forEach((p, i) => {
    income.addRow({
      num: i + 1,
      completedAt: fmtDate(p.completedAt),
      scheduledAt: fmtDate(p.scheduledAt),
      patient: data.patientMap.get(p.patientId) ?? "—",
      doctor: p.doctorId ? (data.doctorMap.get(p.doctorId) ?? "—") : "—",
      service: p.name,
      status: STATUS_LABELS[p.status] ?? p.status,
      payment: PAYMENT_LABELS[p.paymentMethod ?? "cash"] ?? p.paymentMethod ?? "",
      amount: p.price ?? 0,
      notes: p.notes ?? "",
    });
  });
  income.getColumn("amount").numFmt = "#,##0";
  addTotalRow(income, 8, 9, data.procedures.reduce((s, p) => s + (p.price ?? 0), 0));

  // ── Sheet 3: Расходы ───────────────────────────────────────────────────────
  const expensesWs = workbook.addWorksheet("Расходы");
  expensesWs.columns = [
    { header: "№", key: "num", width: 6 },
    { header: "Дата", key: "date", width: 14 },
    { header: "Категория", key: "category", width: 20 },
    { header: "Подкатегория", key: "subcategory", width: 24 },
    { header: "Описание", key: "description", width: 36 },
    { header: "Сумма (₸)", key: "amount", width: 14 },
  ];
  styleHeader(expensesWs);
  data.expenses.forEach((e, i) => {
    expensesWs.addRow({
      num: i + 1,
      date: fmtDate(e.expenseDate),
      category: CATEGORY_LABELS[e.category] ?? e.category,
      subcategory: e.subcategory ?? "",
      description: e.description ?? "",
      amount: Number(e.amount),
    });
  });
  expensesWs.getColumn("amount").numFmt = "#,##0";
  addTotalRow(expensesWs, 5, 6, data.totalOperationalExpenses);

  // ── Sheet 4: Материалы ─────────────────────────────────────────────────────
  const materials = workbook.addWorksheet("Материалы");
  materials.columns = [
    { header: "№", key: "num", width: 6 },
    { header: "Материал", key: "name", width: 32 },
    { header: "Количество", key: "qty", width: 14 },
    { header: "Ед.", key: "unit", width: 8 },
    { header: "Цена за ед.", key: "unitPrice", width: 14 },
    { header: "Процедур", key: "procCount", width: 12 },
    { header: "Сумма (₸)", key: "total", width: 14 },
  ];
  styleHeader(materials);
  data.consumption.forEach((r, i) => {
    materials.addRow({
      num: i + 1,
      name: r.itemName,
      qty: r.totalQuantity,
      unit: r.unit ?? "ед.",
      unitPrice: r.unitPrice ?? 0,
      procCount: r.procedureCount,
      total: r.totalCost,
    });
  });
  materials.getColumn("unitPrice").numFmt = "#,##0";
  materials.getColumn("total").numFmt = "#,##0";
  addTotalRow(materials, 6, 7, data.totalMaterialCost);

  // ── Sheet 5: По врачам ───────────────────────────────────────────────────────
  const byDoctor = workbook.addWorksheet("По врачам");
  byDoctor.columns = [
    { header: "Врач", key: "doctor", width: 28 },
    { header: "Процедур", key: "count", width: 12 },
    { header: "Сумма (₸)", key: "total", width: 16 },
    { header: "% от выручки", key: "pct", width: 14 },
  ];
  styleHeader(byDoctor);
  for (const row of data.revenueByDoctor) {
    byDoctor.addRow({
      doctor: row.name,
      count: row.count,
      total: row.total,
      pct: data.totalRevenue > 0 ? `${Math.round((row.total / data.totalRevenue) * 100)}%` : "0%",
    });
  }
  byDoctor.getColumn("total").numFmt = "#,##0";

  // ── Sheet 6: Категории расходов ────────────────────────────────────────────
  const byCategory = workbook.addWorksheet("Категории расходов");
  byCategory.columns = [
    { header: "Категория", key: "category", width: 24 },
    { header: "Сумма (₸)", key: "amount", width: 16 },
    { header: "% от расходов", key: "pct", width: 16 },
  ];
  styleHeader(byCategory);
  for (const [cat, amount] of Object.entries(data.expensesByCategory)) {
    byCategory.addRow({
      category: CATEGORY_LABELS[cat] ?? cat,
      amount,
      pct:
        data.totalOperationalExpenses > 0
          ? `${Math.round((amount / data.totalOperationalExpenses) * 100)}%`
          : "0%",
    });
  }
  byCategory.getColumn("amount").numFmt = "#,##0";

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function pdfTableHeader(cells: string[]) {
  return cells.map((text) => ({ text, bold: true, fillColor: "#E8F0FE" }));
}

/** pdfmake: colSpan N needs N-1 empty placeholders, then remaining cells in the row. */
function pdfTotalRow(labelColSpan: number, totalText: string) {
  return [
    { text: "ИТОГО", bold: true, colSpan: labelColSpan },
    ...Array.from({ length: labelColSpan - 1 }, () => ({})),
    { text: totalText, bold: true, alignment: "right" as const },
  ];
}

export async function buildFinancialPdf(data: FinancialExportData): Promise<Buffer> {
  const pdfmake = getPdfInstance();

  const procedureRows = data.procedures.map((p, i) => [
    String(i + 1),
    fmtDate(p.completedAt) || "—",
    data.patientMap.get(p.patientId) ?? "—",
    p.doctorId ? (data.doctorMap.get(p.doctorId) ?? "—") : "—",
    p.name,
    STATUS_LABELS[p.status] ?? p.status,
    PAYMENT_LABELS[p.paymentMethod ?? "cash"] ?? p.paymentMethod ?? "",
    { text: fmtMoney(p.price ?? 0), alignment: "right" as const },
  ]);

  const expenseRows = data.expenses.map((e, i) => [
    String(i + 1),
    fmtDate(e.expenseDate),
    CATEGORY_LABELS[e.category] ?? e.category,
    e.subcategory ?? "",
    e.description ?? "",
    { text: fmtMoney(Number(e.amount)), alignment: "right" as const },
  ]);

  const materialRows = data.consumption.map((r, i) => [
    String(i + 1),
    r.itemName,
    `${r.totalQuantity} ${r.unit ?? "ед."}`,
    String(r.procedureCount),
    { text: fmtMoney(r.totalCost), alignment: "right" as const },
  ]);

  const docDefinition = {
    pageSize: "A4" as const,
    pageOrientation: "landscape" as const,
    pageMargins: [28, 36, 28, 36] as [number, number, number, number],
    content: [
      { text: data.clinicName, style: "title" },
      { text: `Финансовый отчёт: ${data.periodLabel}`, style: "subtitle", margin: [0, 0, 0, 12] },

      { text: "Сводные показатели", style: "sectionHeader" },
      {
        table: {
          widths: ["*", "auto", "auto"],
          body: [
            pdfTableHeader(["Показатель", "Сумма", "%"]),
            ["Выручка", { text: fmtMoney(data.totalRevenue), alignment: "right" }, { text: "100%", alignment: "right" }],
            [
              "Затраты на материалы",
              { text: fmtMoney(data.totalMaterialCost), alignment: "right" },
              {
                text: data.totalRevenue > 0 ? `${Math.round((data.totalMaterialCost / data.totalRevenue) * 100)}%` : "—",
                alignment: "right",
              },
            ],
            [
              "Операционные расходы",
              { text: fmtMoney(data.totalOperationalExpenses), alignment: "right" },
              {
                text: data.totalRevenue > 0 ? `${Math.round((data.totalOperationalExpenses / data.totalRevenue) * 100)}%` : "—",
                alignment: "right",
              },
            ],
            [
              { text: "Чистая прибыль", bold: true },
              { text: fmtMoney(data.netProfit), bold: true, alignment: "right" },
              { text: `${data.marginPct}%`, bold: true, alignment: "right" },
            ],
          ],
        },
        layout: "lightHorizontalLines",
        margin: [0, 4, 0, 16],
      },

      { text: `Доходы — процедуры (${data.procedures.length})`, style: "sectionHeader", pageBreak: "before" as const },
      {
        table: {
          headerRows: 1,
          widths: [18, 52, "*", 70, "*", 58, 62, 62],
          body: [
            pdfTableHeader(["№", "Дата", "Пациент", "Врач", "Услуга", "Статус", "Оплата", "Сумма"]),
            ...procedureRows,
            pdfTotalRow(
              7,
              fmtMoney(data.procedures.reduce((s, p) => s + (p.price ?? 0), 0)),
            ),
          ],
        },
        layout: "lightHorizontalLines",
        fontSize: 8,
        margin: [0, 4, 0, 16],
      },

      { text: `Расходы (${data.expenses.length})`, style: "sectionHeader", pageBreak: "before" as const },
      {
        table: {
          headerRows: 1,
          widths: [18, 52, 80, 80, "*", 62],
          body: [
            pdfTableHeader(["№", "Дата", "Категория", "Подкатегория", "Описание", "Сумма"]),
            ...expenseRows,
            pdfTotalRow(5, fmtMoney(data.totalOperationalExpenses)),
          ],
        },
        layout: "lightHorizontalLines",
        fontSize: 8,
        margin: [0, 4, 0, 16],
      },

      ...(data.consumption.length > 0
        ? [
            { text: `Материалы (${data.consumption.length})`, style: "sectionHeader", pageBreak: "before" as const },
            {
              table: {
                headerRows: 1,
                widths: [18, "*", 80, 50, 62],
                body: [
                  pdfTableHeader(["№", "Материал", "Количество", "Процедур", "Сумма"]),
                  ...materialRows,
                  pdfTotalRow(4, fmtMoney(data.totalMaterialCost)),
                ],
              },
              layout: "lightHorizontalLines",
              fontSize: 8,
              margin: [0, 4, 0, 16],
            },
          ]
        : []),

      ...(data.revenueByDoctor.length > 0
        ? [
            { text: "Доходы по врачам", style: "sectionHeader" },
            {
              table: {
                widths: ["*", "auto", "auto", "auto"],
                body: [
                  pdfTableHeader(["Врач", "Процедур", "Сумма", "%"]),
                  ...data.revenueByDoctor.map((r) => [
                    r.name,
                    String(r.count),
                    { text: fmtMoney(r.total), alignment: "right" },
                    {
                      text: data.totalRevenue > 0 ? `${Math.round((r.total / data.totalRevenue) * 100)}%` : "0%",
                      alignment: "right",
                    },
                  ]),
                ],
              },
              layout: "lightHorizontalLines",
              margin: [0, 4, 0, 0],
            },
          ]
        : []),
    ],
    styles: {
      title: { fontSize: 18, bold: true },
      subtitle: { fontSize: 11, color: "#666666" },
      sectionHeader: { fontSize: 13, bold: true, margin: [0, 8, 0, 4] },
    },
    defaultStyle: { font: "Roboto", fontSize: 9 },
  };

  return pdfmake.createPdf(docDefinition).getBuffer();
}

export function exportFilename(filters: FinancialExportFilters, ext: "xlsx" | "pdf"): string {
  const fromStr = filters.dateFrom ? filters.dateFrom.toISOString().slice(0, 10) : "all";
  const toStr = filters.dateTo ? filters.dateTo.toISOString().slice(0, 10) : "all";
  return `finance-${fromStr}-${toStr}.${ext}`;
}
