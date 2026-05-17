import multer from "multer";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { ContractsRepository } from "./contracts.repository";
import { analyzeContractFields, renderContractHtml, PATIENT_FIELDS } from "./contracts.ai";
import { sendToPatient } from "../../shared/messaging";
import { getServerBaseUrl } from "../../shared/green-api";
import { logger } from "../../lib/logger";
import { db, patientsTable, usersTable, clinicsTable, type FieldMapping } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ObjectStorageService } from "../../lib/objectStorage";

const router: IRouter = Router();
const repo = new ContractsRepository();
const storage = new ObjectStorageService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/pdf", "application/msword"];
    cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith(".docx") || file.originalname.endsWith(".pdf"));
  },
});

const ownerAdminRoles = roleGuard("owner", "admin");

/** Safely parse fieldMappings JSONB column value into a typed array. */
function parseFieldMappings(raw: unknown): FieldMapping[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is FieldMapping =>
      typeof m === "object" &&
      m !== null &&
      typeof (m as Record<string, unknown>)["placeholder"] === "string" &&
      typeof (m as Record<string, unknown>)["patientField"] === "string" &&
      typeof (m as Record<string, unknown>)["label"] === "string",
  );
}

// ── Template routes ────────────────────────────────────────────────────────

// GET /contracts/templates
router.get("/templates", authMiddleware, ownerAdminRoles, async (req: Request, res: Response, next: NextFunction) => {
  const templates = await repo.listTemplates(req.user!.clinicId).catch(next);
  if (!templates) return;
  res.json({ success: true, data: { templates } });
});

// POST /contracts/templates/upload — upload DOCX/PDF, run AI analysis
router.post(
  "/templates/upload",
  authMiddleware,
  ownerAdminRoles,
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    const file = req.file;
    if (!file) return next(new ValidationError("Файл не загружен"));

    const name = (req.body?.name as string)?.trim() || file.originalname.replace(/\.[^.]+$/, "");
    const isDocx = file.mimetype.includes("wordprocessingml") || file.originalname.endsWith(".docx");
    const fileType = isDocx ? "docx" : "pdf";

    // 1. Extract text
    let extractedText = "";
    try {
      if (isDocx) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        extractedText = result.value;
      } else {
        const pdfParse = (await import("pdf-parse")).default;
        const result = await pdfParse(file.buffer);
        extractedText = result.text;
      }
    } catch (err) {
      logger.error({ err }, "[contracts] Failed to extract text from template");
      return next(new ValidationError("Не удалось прочитать файл. Убедитесь, что файл не повреждён."));
    }

    // 2. Upload file to object storage
    let fileUrl = "";
    try {
      const uploadUrl = await storage.getObjectEntityUploadURL();
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.mimetype },
        body: file.buffer,
      });
      if (!putRes.ok) throw new Error(`GCS upload failed: ${putRes.status}`);
      const urlObj = new URL(uploadUrl);
      fileUrl = storage.normalizeObjectEntityPath(urlObj.pathname);
    } catch (err) {
      logger.error({ err }, "[contracts] Failed to upload template to object storage");
      return next(new Error("Ошибка при сохранении файла"));
    }

    // 3. AI analysis — detect fields
    const fieldMappings = await analyzeContractFields(extractedText);

    // 4. Save template
    const template = await repo
      .createTemplate({ clinicId: req.user!.clinicId, name, fileUrl, fileType, extractedText, fieldMappings })
      .catch(next);
    if (!template) return;

    res.status(201).json({ success: true, data: { template, patientFields: PATIENT_FIELDS } });
  },
);

// PATCH /contracts/templates/:id/mappings — save updated field mappings
router.patch(
  "/templates/:id/mappings",
  authMiddleware,
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    const parsed = z
      .object({
        fieldMappings: z.array(
          z.object({ placeholder: z.string(), patientField: z.string(), label: z.string() }),
        ),
      })
      .safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation error"));

    const template = await repo.updateTemplateMappings(id, req.user!.clinicId, parsed.data.fieldMappings).catch(next);
    if (!template) return next(new NotFoundError("Шаблон не найден"));
    res.json({ success: true, data: { template } });
  },
);

// DELETE /contracts/templates/:id
router.delete(
  "/templates/:id",
  authMiddleware,
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    const deleted = await repo.deleteTemplate(id, req.user!.clinicId).catch(next);
    if (!deleted) return next(new NotFoundError("Шаблон не найден"));
    res.json({ success: true });
  },
);

// ── Patient contract routes ────────────────────────────────────────────────

// GET /contracts/patient/:patientId — list contracts for a patient
router.get(
  "/patient/:patientId",
  authMiddleware,
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const contracts = await repo
      .listPatientContracts(String(req.params["patientId"]), req.user!.clinicId)
      .catch(next);
    if (!contracts) return;
    res.json({ success: true, data: { contracts } });
  },
);

// POST /contracts/patient/:patientId/send — fill template with patient data and send via WhatsApp
router.post(
  "/patient/:patientId/send",
  authMiddleware,
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const patientId = String(req.params["patientId"]);
    const parsed = z.object({ templateId: z.string() }).safeParse(req.body);
    if (!parsed.success) return next(new ValidationError("templateId обязателен"));

    const clinicId = req.user!.clinicId;
    const { templateId } = parsed.data;

    // Load template
    const template = await repo.findTemplate(templateId, clinicId).catch(next);
    if (!template) return next(new NotFoundError("Шаблон не найден"));

    // Load patient
    const [patientRow] = await db
      .select({
        id: patientsTable.id,
        name: patientsTable.name,
        phone: patientsTable.phone,
        iin: patientsTable.iin,
        dateOfBirth: patientsTable.dateOfBirth,
        gender: patientsTable.gender,
        doctorId: patientsTable.doctorId,
      })
      .from(patientsTable)
      .where(and(eq(patientsTable.id, patientId), eq(patientsTable.clinicId, clinicId)))
      .limit(1);
    if (!patientRow) return next(new NotFoundError("Пациент не найден"));

    // Load clinic name
    const [clinicRow] = await db
      .select({ name: clinicsTable.name })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);
    const clinicName = clinicRow?.name ?? "";

    // Load doctor name if available
    let doctorName = "";
    if (patientRow.doctorId) {
      const [doc] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, patientRow.doctorId))
        .limit(1);
      doctorName = doc?.name ?? "";
    }

    // Build filled data map
    const today = new Date();
    const dateStr = today.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
    const genderMap: Record<string, string> = { male: "мужской", female: "женский", other: "не указан" };

    const filledData: Record<string, string> = {
      "patient.name":        patientRow.name,
      "patient.phone":       patientRow.phone,
      "patient.iin":         patientRow.iin ?? "",
      "patient.dateOfBirth": patientRow.dateOfBirth ?? "",
      "patient.gender":      genderMap[patientRow.gender ?? ""] ?? "",
      "doctor.name":         doctorName,
      "clinic.name":         clinicName,
      "date.today":          dateStr,
      "date.year":           String(today.getFullYear()),
    };

    // Render HTML from extracted text using properly typed mappings
    const fieldMappings = parseFieldMappings(template.fieldMappings);
    const renderedHtml = renderContractHtml(template.extractedText ?? "", fieldMappings, filledData);

    // Generate unique token
    const token = randomUUID();

    // Save contract
    const contract = await repo
      .createPatientContract({ clinicId, patientId, templateId, sentById: req.user!.userId ?? null, token, renderedHtml, filledData })
      .catch(next);
    if (!contract) return;

    // Build public URL and send via WhatsApp
    const baseUrl = getServerBaseUrl() ?? "https://your-app.replit.app";
    const contractUrl = `${baseUrl}/p/contract/${token}`;

    const message = `📋 *${template.name}*\n\nУважаемый(-ая) ${patientRow.name}!\n\nВам отправлен договор для ознакомления и подписи.\n\nОткройте по ссылке: ${contractUrl}\n\nПосле прочтения нажмите кнопку «Подписать».`;

    sendToPatient(clinicId, patientRow.phone, message).catch((err: unknown) => {
      logger.error({ err, patientId, token }, "[contracts] Failed to send WhatsApp message");
    });

    res.status(201).json({ success: true, data: { contract, contractUrl } });
  },
);

export default router;
