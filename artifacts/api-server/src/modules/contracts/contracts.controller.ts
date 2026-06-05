import multer from "multer";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError, WhatsappNotConnectedError } from "../../shared/errors";
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
    const allowed = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/pdf",
      "application/msword",
    ];
    cb(
      null,
      allowed.includes(file.mimetype) ||
        file.originalname.endsWith(".docx") ||
        file.originalname.endsWith(".pdf"),
    );
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
router.get(
  "/templates",
  authMiddleware,
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const templates = await repo.listTemplates(req.user!.clinicId).catch(next);
    if (!templates) return;
    res.json({ success: true, data: { templates } });
  },
);

// GET /contracts/templates/:id — get a single template
router.get(
  "/templates/:id",
  authMiddleware,
  ownerAdminRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    const template = await repo.findTemplate(id, req.user!.clinicId).catch(next);
    if (template === undefined) return;
    if (!template) return next(new NotFoundError("Шаблон не найден"));
    res.json({ success: true, data: { template } });
  },
);

// POST /contracts/templates/upload — upload DOCX/PDF, run AI analysis
router.post(
  "/templates/upload",
  authMiddleware,
  ownerAdminRoles,
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    const file = req.file;
    if (!file) return next(new ValidationError("Файл не загружен"));

    const name =
      (req.body?.name as string)?.trim() || file.originalname.replace(/\.[^.]+$/, "");
    const isDocx =
      file.mimetype.includes("wordprocessingml") || file.originalname.endsWith(".docx");
    const fileType = isDocx ? "docx" : "pdf";

    // 1. Extract text
    let extractedText = "";
    try {
      if (isDocx) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        extractedText = result.value;
      } else {
        // Import internal module directly to bypass pdf-parse's test-file check
        // (top-level index.js tries to open './test/data/05-versions-space.pdf' on load)
        // @ts-ignore
        const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
        const result = await pdfParse(file.buffer);
        extractedText = result.text;
      }
    } catch (err) {
      logger.error({ err }, "[contracts] Failed to extract text from template");
      return next(
        new ValidationError("Не удалось прочитать файл. Убедитесь, что файл не повреждён."),
      );
    }

    // 2. Upload file to object storage and tag with clinic-scoped ACL
    let fileUrl = "";
    try {
      const uploadUrl = await storage.getObjectEntityUploadURL();
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.mimetype },
        body: file.buffer,
      });
      if (!putRes.ok) throw new Error(`GCS upload failed: ${putRes.status}`);

      // Normalize path — pass the full signed URL so normalizeObjectEntityPath
      // can strip the GCS base URL and return "/objects/..." form
      fileUrl = storage.normalizeObjectEntityPath(uploadUrl);

      // Tag the object with clinic ownership so the storage ACL check can enforce tenant isolation
      await storage.trySetObjectEntityAclPolicy(uploadUrl, {
        owner: req.user!.clinicId,
        visibility: "private",
      }).catch((err: unknown) => {
        // ACL tagging is best-effort — log but don't fail the upload
        logger.warn({ err }, "[contracts] Failed to set ACL on uploaded template file");
      });
    } catch (err) {
      logger.error({ err }, "[contracts] Failed to upload template to object storage");
      return next(new Error("Ошибка при сохранении файла"));
    }

    // 3. AI analysis — detect fields
    const fieldMappings = await analyzeContractFields(extractedText);

    // 4. Save template
    const template = await repo
      .createTemplate({
        clinicId: req.user!.clinicId,
        name,
        fileUrl,
        fileType,
        extractedText,
        fieldMappings,
      })
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
    if (!parsed.success)
      return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation error"));

    const template = await repo
      .updateTemplateMappings(id, req.user!.clinicId, parsed.data.fieldMappings)
      .catch(next);
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

    // Load template (also verifies clinic ownership)
    const template = await repo.findTemplate(templateId, clinicId).catch(next);
    if (!template) return next(new NotFoundError("Шаблон не найден"));

    // Load patient (also verifies clinic ownership)
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
    const dateStr = today.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const genderMap: Record<string, string> = {
      male: "мужской",
      female: "женский",
      other: "не указан",
    };

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

    const token = randomUUID();

    const contract = await repo
      .createPatientContract({
        clinicId,
        patientId,
        templateId,
        sentById: req.user!.userId ?? null,
        token,
        renderedHtml,
        filledData,
      })
      .catch(next);
    if (!contract) return;

    const baseUrl = getServerBaseUrl() ?? "https://your-app.replit.app";
    const contractUrl = `${baseUrl}/p/contract/${token}`;

    const message = `📋 *${template.name}*\n\nУважаемый(-ая) ${patientRow.name}!\n\nВам отправлен договор для ознакомления и подписи.\n\nОткройте по ссылке: ${contractUrl}\n\nПосле прочтения нажмите кнопку «Подписать».`;

    sendToPatient(clinicId, patientRow.phone, message).catch((err: unknown) => {
      logger.error({ err, patientId, token }, "[contracts] Failed to send WhatsApp message");
    });

    res.status(201).json({ success: true, data: { contract, contractUrl } });
  },
);

/** Shared helper — loads patient + clinic + doctor for the extraction bundle endpoints */
async function loadBundleContext(
  patientId: string,
  clinicId: string,
): Promise<{
  patientName: string;
  patientPhone: string;
  patientIin: string;
  patientDob: string;
  patientDoctorId: string | null;
  clinicName: string;
  doctorName: string;
} | null> {
  const [patientRow] = await db
    .select({
      id: patientsTable.id,
      name: patientsTable.name,
      phone: patientsTable.phone,
      iin: patientsTable.iin,
      dateOfBirth: patientsTable.dateOfBirth,
      doctorId: patientsTable.doctorId,
    })
    .from(patientsTable)
    .where(and(eq(patientsTable.id, patientId), eq(patientsTable.clinicId, clinicId)))
    .limit(1);
  if (!patientRow) return null;

  const [clinicRow] = await db
    .select({ name: clinicsTable.name })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId))
    .limit(1);

  let doctorName = "";
  if (patientRow.doctorId) {
    const [doc] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, patientRow.doctorId))
      .limit(1);
    doctorName = doc?.name ?? "";
  }

  return {
    patientName: patientRow.name,
    patientPhone: patientRow.phone,
    patientIin: patientRow.iin ?? "",
    patientDob: patientRow.dateOfBirth ?? "",
    patientDoctorId: patientRow.doctorId ?? null,
    clinicName: clinicRow?.name ?? "",
    doctorName,
  };
}

// POST /contracts/patient/:patientId/prepare-extraction-bundle
// Generates all 4 extraction contracts and returns bundleToken+bundleUrl WITHOUT sending WhatsApp.
// Used by the UI to pre-populate step 3 so the doctor can preview before sending.
router.post(
  "/patient/:patientId/prepare-extraction-bundle",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const patientId = String(req.params["patientId"]);
    const clinicId = req.user!.clinicId;

    const ctx = await loadBundleContext(patientId, clinicId).catch(() => null);
    if (!ctx) return next(new NotFoundError("Пациент не найден"));

    const today = new Date();
    const dateStr = today.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

    const { bundleToken, contracts } = await repo
      .createExtractionBundle({
        clinicId,
        patientId,
        sentById: req.user!.userId ?? null,
        patientName: ctx.patientName,
        patientPhone: ctx.patientPhone,
        patientIin: ctx.patientIin,
        patientDob: ctx.patientDob,
        clinicName: ctx.clinicName,
        doctorName: ctx.doctorName,
        date: dateStr,
        year: String(today.getFullYear()),
      })
      .catch(next as (e: unknown) => never);
    if (!contracts) return;

    const baseUrl = getServerBaseUrl() ?? "";
    const bundleUrl = baseUrl ? `${baseUrl}/p/bundle/${bundleToken}` : `/p/bundle/${bundleToken}`;

    res.status(201).json({ success: true, data: { bundleToken, bundleUrl, contracts } });
  },
);

// POST /contracts/bundle/:bundleToken/send-whatsapp
// Sends the WhatsApp link for an already-prepared bundle.
// Returns 422 WHATSAPP_NOT_CONNECTED if the clinic has no WhatsApp configured.
router.post(
  "/bundle/:bundleToken/send-whatsapp",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const bundleToken = String(req.params["bundleToken"]);
    const clinicId = req.user!.clinicId;

    const rows = await repo.findContractsByBundleToken(bundleToken);
    if (!rows.length) return next(new NotFoundError("Пакет не найден"));

    // Security: ensure this bundle belongs to the caller's clinic
    if (rows[0]!.contract.clinicId !== clinicId) {
      return next(new NotFoundError("Пакет не найден"));
    }

    // Check WhatsApp connectivity before attempting to send
    const [clinicSettings] = await db
      .select({
        greenApiInstanceId: clinicsTable.greenApiInstanceId,
        greenApiToken: clinicsTable.greenApiToken,
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);

    const metaEnabled = !!(
      process.env["WHATSAPP_TOKEN"] && process.env["WHATSAPP_PHONE_ID"]
    );
    const greenApiEnabled = !!(
      clinicSettings?.greenApiInstanceId && clinicSettings?.greenApiToken
    );

    if (!greenApiEnabled && !metaEnabled) {
      return next(new WhatsappNotConnectedError());
    }

    const { patientName, patientPhone, clinicName } = rows[0]!;
    const baseUrl = getServerBaseUrl() ?? "";
    const bundleUrl = baseUrl ? `${baseUrl}/p/bundle/${bundleToken}` : `/p/bundle/${bundleToken}`;

    const message =
      `📋 *Пакет документов — Удаление зуба*\n\nУважаемый(-ая) ${patientName}!\n\n` +
      `Вам подготовлены 4 документа для ознакомления и подписи:\n` +
      `1. Договор на оказание услуг\n2. Согласие на удаление зуба\n` +
      `3. Согласие на выполнение рекомендаций\n4. Памятка после удаления\n\n` +
      `Откройте все документы и подпишите по ссылке:\n${bundleUrl}\n\nКлиника: ${clinicName}`;

    try {
      const idMessage = await sendToPatient(clinicId, patientPhone, message);
      if (!idMessage) {
        logger.warn({ bundleToken, clinicId, patientPhone }, "[contracts] sendToPatient returned empty idMessage");
        return res.status(502).json({
          success: false,
          code: "WHATSAPP_SEND_FAILED",
          error: "WhatsApp не подключён или сообщение не доставлено",
        });
      }
      logger.info({ bundleToken, idMessage }, "[contracts] bundle WhatsApp sent");
      await repo.markBundleSent(bundleToken);
      res.json({ success: true, data: { bundleToken, bundleUrl, idMessage } });
    } catch (err) {
      logger.error({ err, bundleToken, clinicId, patientPhone }, "[contracts] Failed to send bundle WhatsApp");
      res.status(502).json({
        success: false,
        code: "WHATSAPP_SEND_FAILED",
        error: err instanceof Error ? err.message : "Ошибка при отправке WhatsApp",
      });
    }
  },
);

// POST /contracts/patient/:patientId/send-extraction-bundle  (kept for backwards compat)
// Creates + immediately sends via WhatsApp in one step.
router.post(
  "/patient/:patientId/send-extraction-bundle",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const patientId = String(req.params["patientId"]);
    const clinicId = req.user!.clinicId;

    const ctx = await loadBundleContext(patientId, clinicId).catch(() => null);
    if (!ctx) return next(new NotFoundError("Пациент не найден"));

    const today = new Date();
    const dateStr = today.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

    const { bundleToken, contracts } = await repo
      .createExtractionBundle({
        clinicId,
        patientId,
        sentById: req.user!.userId ?? null,
        patientName: ctx.patientName,
        patientPhone: ctx.patientPhone,
        patientIin: ctx.patientIin,
        patientDob: ctx.patientDob,
        clinicName: ctx.clinicName,
        doctorName: ctx.doctorName,
        date: dateStr,
        year: String(today.getFullYear()),
      })
      .catch(next as (e: unknown) => never);
    if (!contracts) return;

    const baseUrl = getServerBaseUrl() ?? "";
    const bundleUrl = baseUrl ? `${baseUrl}/p/bundle/${bundleToken}` : `/p/bundle/${bundleToken}`;

    const message =
      `📋 *Пакет документов — Удаление зуба*\n\nУважаемый(-ая) ${ctx.patientName}!\n\n` +
      `Вам отправлены 4 документа для ознакомления и подписи:\n` +
      `1. Договор на оказание услуг\n2. Согласие на удаление зуба\n` +
      `3. Согласие на выполнение рекомендаций\n4. Памятка после удаления\n\n` +
      `Откройте все документы и подпишите по ссылке:\n${bundleUrl}\n\nКлиника: ${ctx.clinicName}`;

    await sendToPatient(clinicId, ctx.patientPhone, message)
      .then(() => repo.markBundleSent(bundleToken))
      .catch((err: unknown) => {
        logger.error({ err, patientId, bundleToken }, "[contracts] Failed to send bundle WhatsApp");
      });

    res.status(201).json({ success: true, data: { bundleToken, bundleUrl, contracts } });
  },
);

export default router;
