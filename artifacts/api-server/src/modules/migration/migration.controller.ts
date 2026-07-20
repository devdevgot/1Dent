import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import {
  db,
  clinicsTable,
  patientsTable,
  toothRecordsTable,
  treatmentPlansTable,
  treatmentPlanItemsTable,
  proceduresTable,
  procedureTemplatesTable,
} from "@workspace/db";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { migrationService } from "./migration.service";
import type { AiColumnMapping } from "./migration.types";

const router: IRouter = Router();

router.use(authMiddleware);
router.use(roleGuard("owner", "admin"));

// POST /migration/excel/preview
const excelPreviewSchema = z.object({
  fileBase64: z.string().min(10, "fileBase64 is required"),
});

router.post(
  "/excel/preview",
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = excelPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    try {
      const preview = migrationService.parseExcel(parsed.data.fileBase64);
      res.json({ success: true, data: preview });
    } catch (err) {
      next(new ValidationError((err as Error).message));
    }
  },
);

// POST /migration/excel/confirm
const excelConfirmSchema = z.object({
  fileBase64: z.string().min(10, "fileBase64 is required"),
  mapping: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    age: z.string().optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
  }),
});

router.post(
  "/excel/confirm",
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = excelConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const job = await migrationService
      .startExcelImport(req.user!.clinicId, parsed.data.fileBase64, parsed.data.mapping)
      .catch(next);
    if (!job) return;
    res.json({ success: true, data: { job } });
  },
);

// POST /migration/trello/connect
const trelloConnectSchema = z.object({
  apiKey: z.string().min(1, "Trello API key is required"),
  token: z.string().min(1, "Trello token is required"),
});

router.post(
  "/trello/connect",
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = trelloConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const result = await migrationService.connectTrello(parsed.data.apiKey, parsed.data.token).catch(next);
    if (!result) return;
    res.json({ success: true, data: result });
  },
);

// POST /migration/trello/import
const trelloImportSchema = z.object({
  apiKey: z.string().min(1),
  token: z.string().min(1),
  boardId: z.string().min(1, "boardId is required"),
});

router.post(
  "/trello/import",
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = trelloImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const job = await migrationService
      .startTrelloImport(req.user!.clinicId, parsed.data.apiKey, parsed.data.token, parsed.data.boardId)
      .catch(next);
    if (!job) return;
    res.json({ success: true, data: { job } });
  },
);

// POST /migration/ai/analyze
const aiAnalyzeSchema = z.object({
  fileBase64: z.string().min(10, "fileBase64 is required"),
  fileType: z.enum(["xlsx", "csv", "pdf"]),
});

router.post(
  "/ai/analyze",
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = aiAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    try {
      const result = await migrationService.analyzeFileWithAi(
        req.user!.clinicId,
        parsed.data.fileBase64,
        parsed.data.fileType,
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(new ValidationError((err as Error).message));
    }
  },
);

// POST /migration/ai/confirm
const aiConfirmSchema = z.object({
  fileBase64: z.string().min(10, "fileBase64 is required"),
  fileType: z.enum(["xlsx", "csv", "pdf"]),
  mapping: z.record(z.string()),
  detectedCategories: z.array(z.enum(["patients", "procedures", "templates"])),
  rows: z.array(z.record(z.string())).optional(),
});

router.post(
  "/ai/confirm",
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = aiConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
    }
    const job = await migrationService
      .startAiImport(
        req.user!.clinicId,
        parsed.data.fileBase64,
        parsed.data.fileType,
        parsed.data.mapping as AiColumnMapping,
        parsed.data.detectedCategories,
        parsed.data.rows,
      )
      .catch(next);
    if (!job) return;
    res.json({ success: true, data: { job } });
  },
);

// GET /migration/export  — download full clinic data as XLSX
router.get(
  "/export",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user!.clinicId;

      const [clinicRows, patients, toothRecords, plans, planItems, procedures, templates] =
        await Promise.all([
          db.select().from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1),
          db.select().from(patientsTable).where(eq(patientsTable.clinicId, clinicId)),
          db.select().from(toothRecordsTable).where(eq(toothRecordsTable.clinicId, clinicId)),
          db.select().from(treatmentPlansTable).where(eq(treatmentPlansTable.clinicId, clinicId)),
          db.select().from(treatmentPlanItemsTable).where(eq(treatmentPlanItemsTable.clinicId, clinicId)),
          db.select().from(proceduresTable).where(eq(proceduresTable.clinicId, clinicId)),
          db.select().from(procedureTemplatesTable).where(eq(procedureTemplatesTable.clinicId, clinicId)),
        ]);

      const clinic = clinicRows[0];
      const wb = new ExcelJS.Workbook();
      wb.creator = "1Dent CRM";
      wb.created = new Date();

      const style = (ws: ExcelJS.Worksheet) => {
        const row = ws.getRow(1);
        row.font = { bold: true };
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
        row.commit();
      };

      // Sheet 1 — Clinic
      const clinicWs = wb.addWorksheet("Клиника");
      clinicWs.columns = [
        { header: "Поле", key: "field", width: 28 },
        { header: "Значение", key: "value", width: 50 },
      ];
      if (clinic) {
        [
          ["Название", clinic.name],
          ["ID клиники", clinic.id],
          ["Тарифный план", clinic.plan],
          ["WhatsApp номер", clinic.whatsappPhone ?? ""],
          ["Дата регистрации", clinic.createdAt?.toISOString() ?? ""],
        ].forEach(([field, value]) => clinicWs.addRow({ field, value }));
      }
      style(clinicWs);

      // Sheet 2 — Patients
      const patWs = wb.addWorksheet("Пациенты");
      patWs.columns = [
        { header: "ID", key: "id", width: 30 },
        { header: "Имя", key: "name", width: 25 },
        { header: "Телефон", key: "phone", width: 18 },
        { header: "ИИН", key: "iin", width: 14 },
        { header: "Дата рождения", key: "dateOfBirth", width: 16 },
        { header: "Пол", key: "gender", width: 10 },
        { header: "Источник", key: "source", width: 15 },
        { header: "Статус", key: "status", width: 22 },
        { header: "Заметки", key: "notes", width: 40 },
        { header: "Создан", key: "createdAt", width: 22 },
      ];
      patients.forEach((p) =>
        patWs.addRow({
          id: p.id, name: p.name, phone: p.phone, iin: p.iin ?? "",
          dateOfBirth: p.dateOfBirth ?? "", gender: p.gender ?? "",
          source: p.source, status: p.status, notes: p.notes ?? "",
          createdAt: p.createdAt?.toISOString() ?? "",
        }),
      );
      style(patWs);

      // Sheet 3 — Tooth map
      const toothWs = wb.addWorksheet("Карта зубов");
      toothWs.columns = [
        { header: "ID пациента", key: "patientId", width: 30 },
        { header: "Зуб (FDI)", key: "toothFdi", width: 12 },
        { header: "Состояние", key: "condition", width: 20 },
        { header: "Заметки", key: "notes", width: 35 },
        { header: "ИИ-анализ", key: "aiAnalysis", width: 40 },
        { header: "Обновлён", key: "updatedAt", width: 22 },
      ];
      toothRecords.forEach((t) =>
        toothWs.addRow({
          patientId: t.patientId, toothFdi: t.toothFdi, condition: t.condition,
          notes: t.notes ?? "", aiAnalysis: t.aiAnalysis ?? "",
          updatedAt: t.updatedAt?.toISOString() ?? "",
        }),
      );
      style(toothWs);

      // Sheet 4 — Treatment plans
      const plansWs = wb.addWorksheet("Планы лечения");
      plansWs.columns = [
        { header: "ID плана", key: "id", width: 30 },
        { header: "ID пациента", key: "patientId", width: 30 },
        { header: "№ плана", key: "planNumber", width: 10 },
        { header: "Статус", key: "status", width: 15 },
        { header: "Итого (₸)", key: "totalCost", width: 14 },
        { header: "Заметки", key: "notes", width: 40 },
        { header: "Создан", key: "createdAt", width: 22 },
      ];
      plans.forEach((p) =>
        plansWs.addRow({
          id: p.id, patientId: p.patientId, planNumber: p.planNumber,
          status: p.status, totalCost: p.totalCost, notes: p.notes ?? "",
          createdAt: p.createdAt?.toISOString() ?? "",
        }),
      );
      style(plansWs);

      // Sheet 5 — Treatment plan items
      const itemsWs = wb.addWorksheet("Пункты планов");
      itemsWs.columns = [
        { header: "ID плана", key: "planId", width: 30 },
        { header: "ID пациента", key: "patientId", width: 30 },
        { header: "Зуб (FDI)", key: "toothFdi", width: 12 },
        { header: "Состояние", key: "condition", width: 20 },
        { header: "МКБ-10", key: "mkb10Code", width: 12 },
        { header: "Название", key: "title", width: 30 },
        { header: "Цена (₸)", key: "price", width: 12 },
        { header: "Статус", key: "status", width: 15 },
      ];
      planItems.forEach((i) =>
        itemsWs.addRow({
          planId: i.planId, patientId: i.patientId, toothFdi: i.toothFdi ?? "",
          condition: i.condition ?? "", mkb10Code: i.mkb10Code ?? "",
          title: i.title, price: i.price, status: i.status,
        }),
      );
      style(itemsWs);

      // Sheet 6 — Procedures
      const procWs = wb.addWorksheet("Процедуры");
      procWs.columns = [
        { header: "ID пациента", key: "patientId", width: 30 },
        { header: "Название", key: "name", width: 30 },
        { header: "Статус", key: "status", width: 20 },
        { header: "Цена (₸)", key: "price", width: 12 },
        { header: "Способ оплаты", key: "paymentMethod", width: 20 },
        { header: "Запланирован", key: "scheduledAt", width: 22 },
        { header: "Выполнен", key: "completedAt", width: 22 },
        { header: "Заметки", key: "notes", width: 40 },
      ];
      procedures.forEach((p) =>
        procWs.addRow({
          patientId: p.patientId, name: p.name, status: p.status, price: p.price,
          paymentMethod: p.paymentMethod ?? "",
          scheduledAt: p.scheduledAt?.toISOString() ?? "",
          completedAt: p.completedAt?.toISOString() ?? "",
          notes: p.notes ?? "",
        }),
      );
      style(procWs);

      // Sheet 7 — Procedure templates
      const tmplWs = wb.addWorksheet("Шаблоны услуг");
      tmplWs.columns = [
        { header: "Название", key: "name", width: 30 },
        { header: "Категория", key: "category", width: 20 },
        { header: "Цена по умолчанию (₸)", key: "defaultPrice", width: 22 },
        { header: "Описание", key: "description", width: 40 },
        { header: "Код", key: "code", width: 15 },
      ];
      templates.forEach((t) =>
        tmplWs.addRow({
          name: t.name, category: t.category, defaultPrice: t.defaultPrice,
          description: t.description ?? "", code: t.code ?? "",
        }),
      );
      style(tmplWs);

      const buffer = await wb.xlsx.writeBuffer();
      const date = new Date().toISOString().split("T")[0];
      const filename = `1dent_export_${date}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(buffer));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /migration/wipe  — export full clinic data as XLSX, then delete everything
// Returns the XLSX file so the client can download it in a single request.
router.delete(
  "/wipe",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user!.clinicId;

      // 1. Generate XLSX backup (same logic as GET /export)
      const [clinicRows, patients, toothRecords, plans, planItems, procedures, templates] =
        await Promise.all([
          db.select().from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1),
          db.select().from(patientsTable).where(eq(patientsTable.clinicId, clinicId)),
          db.select().from(toothRecordsTable).where(eq(toothRecordsTable.clinicId, clinicId)),
          db.select().from(treatmentPlansTable).where(eq(treatmentPlansTable.clinicId, clinicId)),
          db.select().from(treatmentPlanItemsTable).where(eq(treatmentPlanItemsTable.clinicId, clinicId)),
          db.select().from(proceduresTable).where(eq(proceduresTable.clinicId, clinicId)),
          db.select().from(procedureTemplatesTable).where(eq(procedureTemplatesTable.clinicId, clinicId)),
        ]);

      const clinic = clinicRows[0];
      const wb = new ExcelJS.Workbook();
      wb.creator = "1Dent CRM";
      wb.created = new Date();

      const style = (ws: ExcelJS.Worksheet) => {
        const row = ws.getRow(1);
        row.font = { bold: true };
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
        row.commit();
      };

      const clinicWs = wb.addWorksheet("Клиника");
      clinicWs.columns = [
        { header: "Поле", key: "field", width: 28 },
        { header: "Значение", key: "value", width: 50 },
      ];
      if (clinic) {
        [
          ["Название", clinic.name],
          ["ID клиники", clinic.id],
          ["Тарифный план", clinic.plan],
          ["WhatsApp номер", clinic.whatsappPhone ?? ""],
          ["Дата регистрации", clinic.createdAt?.toISOString() ?? ""],
        ].forEach(([field, value]) => clinicWs.addRow({ field, value }));
      }
      style(clinicWs);

      const patWs = wb.addWorksheet("Пациенты");
      patWs.columns = [
        { header: "ID", key: "id", width: 30 },
        { header: "Имя", key: "name", width: 25 },
        { header: "Телефон", key: "phone", width: 18 },
        { header: "ИИН", key: "iin", width: 14 },
        { header: "Дата рождения", key: "dateOfBirth", width: 16 },
        { header: "Пол", key: "gender", width: 10 },
        { header: "Источник", key: "source", width: 15 },
        { header: "Статус", key: "status", width: 22 },
        { header: "Заметки", key: "notes", width: 40 },
        { header: "Создан", key: "createdAt", width: 22 },
      ];
      patients.forEach((p) =>
        patWs.addRow({
          id: p.id, name: p.name, phone: p.phone, iin: p.iin ?? "",
          dateOfBirth: p.dateOfBirth ?? "", gender: p.gender ?? "",
          source: p.source, status: p.status, notes: p.notes ?? "",
          createdAt: p.createdAt?.toISOString() ?? "",
        }),
      );
      style(patWs);

      const toothWs = wb.addWorksheet("Карта зубов");
      toothWs.columns = [
        { header: "ID пациента", key: "patientId", width: 30 },
        { header: "Зуб (FDI)", key: "toothFdi", width: 12 },
        { header: "Состояние", key: "condition", width: 20 },
        { header: "Заметки", key: "notes", width: 35 },
        { header: "ИИ-анализ", key: "aiAnalysis", width: 40 },
        { header: "Обновлён", key: "updatedAt", width: 22 },
      ];
      toothRecords.forEach((t) =>
        toothWs.addRow({
          patientId: t.patientId, toothFdi: t.toothFdi, condition: t.condition,
          notes: t.notes ?? "", aiAnalysis: t.aiAnalysis ?? "",
          updatedAt: t.updatedAt?.toISOString() ?? "",
        }),
      );
      style(toothWs);

      const plansWs = wb.addWorksheet("Планы лечения");
      plansWs.columns = [
        { header: "ID плана", key: "id", width: 30 },
        { header: "ID пациента", key: "patientId", width: 30 },
        { header: "№ плана", key: "planNumber", width: 10 },
        { header: "Статус", key: "status", width: 15 },
        { header: "Итого (₸)", key: "totalCost", width: 14 },
        { header: "Заметки", key: "notes", width: 40 },
        { header: "Создан", key: "createdAt", width: 22 },
      ];
      plans.forEach((p) =>
        plansWs.addRow({
          id: p.id, patientId: p.patientId, planNumber: p.planNumber,
          status: p.status, totalCost: p.totalCost, notes: p.notes ?? "",
          createdAt: p.createdAt?.toISOString() ?? "",
        }),
      );
      style(plansWs);

      const itemsWs = wb.addWorksheet("Пункты планов");
      itemsWs.columns = [
        { header: "ID плана", key: "planId", width: 30 },
        { header: "ID пациента", key: "patientId", width: 30 },
        { header: "Зуб (FDI)", key: "toothFdi", width: 12 },
        { header: "Состояние", key: "condition", width: 20 },
        { header: "МКБ-10", key: "mkb10Code", width: 12 },
        { header: "Название", key: "title", width: 30 },
        { header: "Цена (₸)", key: "price", width: 12 },
        { header: "Статус", key: "status", width: 15 },
      ];
      planItems.forEach((i) =>
        itemsWs.addRow({
          planId: i.planId, patientId: i.patientId, toothFdi: i.toothFdi ?? "",
          condition: i.condition ?? "", mkb10Code: i.mkb10Code ?? "",
          title: i.title, price: i.price, status: i.status,
        }),
      );
      style(itemsWs);

      const procWs = wb.addWorksheet("Процедуры");
      procWs.columns = [
        { header: "ID пациента", key: "patientId", width: 30 },
        { header: "Название", key: "name", width: 30 },
        { header: "Статус", key: "status", width: 20 },
        { header: "Цена (₸)", key: "price", width: 12 },
        { header: "Способ оплаты", key: "paymentMethod", width: 20 },
        { header: "Запланирован", key: "scheduledAt", width: 22 },
        { header: "Выполнен", key: "completedAt", width: 22 },
        { header: "Заметки", key: "notes", width: 40 },
      ];
      procedures.forEach((p) =>
        procWs.addRow({
          patientId: p.patientId, name: p.name, status: p.status, price: p.price,
          paymentMethod: p.paymentMethod ?? "",
          scheduledAt: p.scheduledAt?.toISOString() ?? "",
          completedAt: p.completedAt?.toISOString() ?? "",
          notes: p.notes ?? "",
        }),
      );
      style(procWs);

      const tmplWs = wb.addWorksheet("Шаблоны услуг");
      tmplWs.columns = [
        { header: "Название", key: "name", width: 30 },
        { header: "Категория", key: "category", width: 20 },
        { header: "Цена по умолчанию (₸)", key: "defaultPrice", width: 22 },
        { header: "Описание", key: "description", width: 40 },
        { header: "Код", key: "code", width: 15 },
      ];
      templates.forEach((t) =>
        tmplWs.addRow({
          name: t.name, category: t.category, defaultPrice: t.defaultPrice,
          description: t.description ?? "", code: t.code ?? "",
        }),
      );
      style(tmplWs);

      const buffer = await wb.xlsx.writeBuffer();

      // 2. Delete all clinic data (XLSX is already in memory, safe to delete now)
      await db.delete(patientsTable).where(eq(patientsTable.clinicId, clinicId));
      await db.delete(procedureTemplatesTable).where(eq(procedureTemplatesTable.clinicId, clinicId));

      // 3. Send the XLSX file as response
      const date = new Date().toISOString().split("T")[0];
      const filename = `1dent_export_${date}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(buffer));
    } catch (err) {
      next(err);
    }
  },
);

// GET /migration/jobs
router.get(
  "/jobs",
  async (req: Request, res: Response, next: NextFunction) => {
    const jobs = await migrationService.listJobs(req.user!.clinicId).catch(next);
    if (!jobs) return;
    res.json({ success: true, data: { jobs } });
  },
);

// GET /migration/:jobId/status
router.get(
  "/:jobId/status",
  async (req: Request, res: Response, next: NextFunction) => {
    const jobId = String(req.params["jobId"]);
    const job = await migrationService.getJobStatus(req.user!.clinicId, jobId).catch((err: Error) => {
      if (err.message.includes("not found")) return next(new NotFoundError("Migration job not found"));
      return next(err);
    });
    if (!job) return;
    res.json({ success: true, data: { job } });
  },
);

export default router;
