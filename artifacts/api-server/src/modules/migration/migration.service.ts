import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { db, patientsTable, migrationJobsTable, usersTable, proceduresTable, procedureTemplatesTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { logger } from "../../lib/logger";
import type {
  ColumnMapping,
  ExcelConfirmRow,
  ExcelPreviewResponse,
  TrelloBoard,
  TrelloConnectResponse,
  MigrationJobStatusResponse,
  ExcelJobPayload,
  TrelloJobPayload,
  FileType,
  AiColumnMapping,
  AiFieldKey,
  AiAnalyzeResponse,
  AiImportJobPayload,
  DetectedCategory,
} from "./migration.types";
import { getMigrationQueue } from "./migration.queue";

const PREVIEW_ROWS = 20;
const AI_PREVIEW_ROWS = 30;
const BATCH_SIZE = 50;
const MAX_IMPORT_ROWS = 5000;
const PDF_TEXT_LIMIT = 4000;

const TRELLO_BASE_URL = "https://api.trello.com/1";

const NAME_HINTS = ["имя", "фио", "name", "пациент", "patient", "ф.и.о", "fullname", "full_name"];
const PHONE_HINTS = ["телефон", "phone", "тел", "мобильный", "номер", "mobile", "number", "contact"];
const AGE_HINTS = ["возраст", "age", "лет", "year", "год"];
const NOTES_HINTS = ["примечания", "заметки", "notes", "комментарий", "comment", "описание"];
const STATUS_HINTS = ["статус", "status", "этап", "stage", "состояние"];

const AI_FIELD_HINTS: Record<AiFieldKey, string[]> = {
  name:             ["имя", "фио", "ф.и.о", "name", "fullname", "пациент", "patient"],
  phone:            ["телефон", "phone", "тел", "мобильный", "номер", "mobile", "number"],
  iin:              ["иин", "iin", "инн", "идентификатор", "identity"],
  dateOfBirth:      ["дата рождения", "date of birth", "dob", "birthdate", "день рождения", "рождения"],
  gender:           ["пол", "gender", "sex"],
  source:           ["источник", "откуда", "source", "канал", "channel"],
  status:           ["статус", "status", "этап", "stage", "состояние"],
  doctorName:       ["врач", "doctor", "доктор", "специалист", "specialist", "physician"],
  notes:            ["примечания", "заметки", "notes", "комментарий", "comment", "описание"],
  procedureName:    ["процедура", "procedure", "услуга", "service", "лечение", "treatment", "наименование"],
  procedurePrice:   ["цена", "стоимость", "price", "cost", "сумма", "amount", "тариф"],
  procedureStatus:  ["статус процедуры", "procedure status", "выполнено"],
  scheduledAt:      ["дата приёма", "дата", "date", "время", "appointment", "запись", "приём"],
  paymentMethod:    ["оплата", "способ оплаты", "payment", "payment method", "метод"],
  procedureNotes:   ["примечания к процедуре", "procedure notes"],
  templateName:     ["шаблон", "template", "тип услуги"],
  templatePrice:    ["цена шаблона", "template price"],
  templateCategory: ["категория", "category", "раздел"],
};

function detectColumn(headers: string[], hints: string[]): string | undefined {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const hint of hints) {
    const idx = lower.findIndex((h) => h.includes(hint));
    if (idx !== -1) return headers[idx];
  }
  return undefined;
}

function detectMapping(headers: string[]): ColumnMapping {
  return {
    name: detectColumn(headers, NAME_HINTS),
    phone: detectColumn(headers, PHONE_HINTS),
    age: detectColumn(headers, AGE_HINTS),
    notes: detectColumn(headers, NOTES_HINTS),
    status: detectColumn(headers, STATUS_HINTS),
  };
}

function detectAiMappingHeuristic(headers: string[]): AiColumnMapping {
  const mapping: AiColumnMapping = {};
  const taken = new Set<AiFieldKey>();
  for (const header of headers) {
    const lh = header.toLowerCase().trim();
    let bestField: AiFieldKey | "" = "";
    for (const [field, hints] of Object.entries(AI_FIELD_HINTS) as [AiFieldKey, string[]][]) {
      if (taken.has(field)) continue;
      if (hints.some((h) => lh.includes(h))) {
        bestField = field;
        break;
      }
    }
    mapping[header] = bestField;
    if (bestField) taken.add(bestField);
  }
  return mapping;
}

function detectCategories(mapping: AiColumnMapping): DetectedCategory[] {
  const values = Object.values(mapping).filter(Boolean) as AiFieldKey[];
  const cats: DetectedCategory[] = [];
  const patientFields: AiFieldKey[] = ["name", "phone", "iin", "dateOfBirth", "gender", "source", "status", "doctorName", "notes"];
  const procedureFields: AiFieldKey[] = ["procedureName", "procedurePrice", "procedureStatus", "scheduledAt", "paymentMethod", "procedureNotes"];
  const templateFields: AiFieldKey[] = ["templateName", "templatePrice", "templateCategory"];
  if (values.some((v) => patientFields.includes(v))) cats.push("patients");
  if (values.some((v) => procedureFields.includes(v))) cats.push("procedures");
  if (values.some((v) => templateFields.includes(v))) cats.push("templates");
  return cats;
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^8/, "7").replace(/^(?!7)/, "7");
}

const TRELLO_STATUS_MAP: Record<string, string> = {
  новые: "new_request",
  "новый запрос": "new_request",
  new: "new_request",
  "new request": "new_request",
  консультация: "initial_consultation",
  consultation: "initial_consultation",
  диагностика: "diagnostics",
  diagnostics: "diagnostics",
  лечение: "treatment_in_progress",
  "в лечении": "treatment_in_progress",
  treatment: "treatment_in_progress",
  "in progress": "treatment_in_progress",
  "in treatment": "treatment_in_progress",
  "пост-оп": "post_op_monitoring",
  "post-op": "post_op_monitoring",
  завершено: "completed",
  completed: "completed",
  done: "completed",
};

const VALID_PATIENT_STATUSES = new Set([
  "new_request", "initial_consultation", "diagnostics",
  "treatment_assigned", "treatment_in_progress", "post_op_monitoring", "completed",
]);

function mapToPatientStatus(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (VALID_PATIENT_STATUSES.has(lower)) return lower;
  return TRELLO_STATUS_MAP[lower] ?? "new_request";
}

function parseCsvText(text: string): { headers: string[]; allRows: Record<string, string>[] } {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });
  const headers = result.meta.fields ?? [];
  return { headers, allRows: result.data };
}

async function parsePdfToText(base64data: string): Promise<string> {
  const buffer = Buffer.from(base64data, "base64");
  // Dynamic import to avoid pdf-parse reading test files on module load
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text.slice(0, PDF_TEXT_LIMIT);
}

async function callOpenRouterAi(prompt: string): Promise<string> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://1dent.app",
      "X-Title": "1Dent Migration",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-001",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content ?? "";
  return content;
}

function buildAnalyzePromptForTable(headers: string[], previewRows: Record<string, string>[]): string {
  const sampleRows = previewRows.slice(0, 5);
  const previewText = sampleRows.map((r) => headers.map((h) => `${h}: ${r[h] ?? ""}`).join(" | ")).join("\n");

  const fieldList = Object.keys(AI_FIELD_HINTS).join(", ");

  return `You are a data migration expert for a dental clinic CRM.
Analyze the following spreadsheet columns and sample data, then map each column header to the most appropriate field from this list:
${fieldList}

Column headers: ${headers.join(", ")}

Sample data:
${previewText}

Return a JSON object with exactly this structure:
{
  "mapping": { "<column_header>": "<field_name_or_empty_string>" },
  "detectedCategories": ["patients", "procedures", "templates"]
}

Rules:
- Every column header from the input must appear as a key in "mapping"
- Use an empty string "" if no field matches
- "detectedCategories" should include only the categories that have at least one mapped field
- Respond only with valid JSON, no explanation`;
}

function buildAnalyzePromptForPdf(rawText: string): string {
  const fieldList = Object.keys(AI_FIELD_HINTS).join(", ");

  return `You are a data migration expert for a dental clinic CRM.
The following text was extracted from a PDF document. It may contain patient records, appointments, or procedure data in any format (table, list, etc.).

Available fields to map to: ${fieldList}

PDF text:
${rawText}

Analyze the text and return a JSON object with this structure:
{
  "mapping": { "<detected_column_or_label>": "<field_name_or_empty_string>" },
  "detectedCategories": ["patients", "procedures", "templates"],
  "rows": [{"<label1>": "<value1>", "<label2>": "<value2>"}, ...]
}

Rules:
- "mapping" keys should be the labels/column names you detected in the text
- "rows" should be ALL rows of structured data you extracted (up to 500 rows; use the same keys as "mapping")
- "detectedCategories" should include only relevant categories
- Respond only with valid JSON, no explanation`;
}

export class MigrationService {
  parseExcel(base64data: string): ExcelPreviewResponse {
    const buffer = Buffer.from(base64data, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("Excel file has no sheets");

    const sheet = workbook.Sheets[sheetName]!;
    const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });

    if (rawRows.length < 1) throw new Error("Excel file is empty");

    const headers = (rawRows[0] as string[]).map((h) => String(h ?? "").trim()).filter(Boolean);
    if (headers.length === 0) throw new Error("Excel file has no headers in the first row");

    const allDataRows = rawRows.slice(1);
    const totalRows = allDataRows.length;
    const previewData = allDataRows.slice(0, PREVIEW_ROWS);
    const rows: Record<string, string>[] = previewData.map((rawRow) => {
      const arr = rawRow as string[];
      const cells: Record<string, string> = {};
      headers.forEach((h, i) => {
        cells[h] = String(arr[i] ?? "").trim();
      });
      return cells;
    });

    return {
      headers,
      rows,
      suggestedMapping: detectMapping(headers),
      totalRows,
    };
  }

  /** Finds the first sheet in a workbook that has at least one non-empty header row.
   *  Falls back to SheetNames[0] if no sheet has data (so the normal "no headers" error fires). */
  private _findFirstDataSheet(workbook: XLSX.WorkBook): { sheetName: string; sheet: XLSX.WorkSheet } {
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
      if (rawRows.length < 1) continue;
      const headers = (rawRows[0] as string[]).map((h) => String(h ?? "").trim()).filter(Boolean);
      if (headers.length > 0) return { sheetName, sheet };
    }
    // no sheet with data found — return first sheet so downstream throws the proper error
    const sheetName = workbook.SheetNames[0] ?? "";
    return { sheetName, sheet: workbook.Sheets[sheetName] ?? {} };
  }

  parseCsv(base64data: string): ExcelPreviewResponse {
    const text = Buffer.from(base64data, "base64").toString("utf-8");
    const { headers, allRows } = parseCsvText(text);
    if (headers.length === 0) throw new Error("CSV file is empty or has no headers");
    const totalRows = allRows.length;
    const rows = allRows.slice(0, PREVIEW_ROWS);
    return { headers, rows, suggestedMapping: detectMapping(headers), totalRows };
  }

  async analyzeFileWithAi(base64data: string, fileType: FileType): Promise<AiAnalyzeResponse> {
    if (fileType === "pdf") {
      return this._analyzePdf(base64data);
    }
    return this._analyzeTableFile(base64data, fileType);
  }

  private async _analyzeTableFile(base64data: string, fileType: FileType): Promise<AiAnalyzeResponse> {
    let headers: string[];
    let allRows: Record<string, string>[];

    if (fileType === "xlsx") {
      const buffer = Buffer.from(base64data, "base64");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      if (!workbook.SheetNames.length) throw new Error("Excel file has no sheets");
      const { sheetName, sheet } = this._findFirstDataSheet(workbook);
      logger.debug({ sheetName, totalSheets: workbook.SheetNames.length }, "[MigrationService] Using sheet for analysis");
      const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
      if (rawRows.length < 1) throw new Error("File is empty");
      headers = (rawRows[0] as string[]).map((h) => String(h ?? "").trim()).filter(Boolean);
      allRows = rawRows.slice(1).slice(0, MAX_IMPORT_ROWS).map((rawRow) => {
        const arr = rawRow as string[];
        const cells: Record<string, string> = {};
        headers.forEach((h, i) => { cells[h] = String(arr[i] ?? "").trim(); });
        return cells;
      });
    } else {
      const text = Buffer.from(base64data, "base64").toString("utf-8");
      const parsed = parseCsvText(text);
      headers = parsed.headers;
      allRows = parsed.allRows.slice(0, MAX_IMPORT_ROWS);
    }

    if (headers.length === 0) throw new Error("File has no headers");

    const previewRows = allRows.slice(0, AI_PREVIEW_ROWS);
    const totalRows = allRows.length;

    let mapping: AiColumnMapping = detectAiMappingHeuristic(headers);

    try {
      const prompt = buildAnalyzePromptForTable(headers, previewRows);
      const aiResponse = await callOpenRouterAi(prompt);
      const parsed = JSON.parse(aiResponse) as { mapping?: Record<string, string>; detectedCategories?: string[] };
      if (parsed.mapping && typeof parsed.mapping === "object") {
        const sanitized: AiColumnMapping = {};
        for (const [col, field] of Object.entries(parsed.mapping)) {
          sanitized[col] = (Object.keys(AI_FIELD_HINTS).includes(field) ? field : "") as AiFieldKey | "";
        }
        mapping = sanitized;
      }
    } catch (err) {
      logger.warn({ err }, "[MigrationService] AI analysis failed, using heuristic fallback");
    }

    const detectedCategories = detectCategories(mapping);

    return {
      mapping,
      detectedCategories,
      headers,
      previewRows,
      totalRows,
      isPdf: false,
    };
  }

  private async _analyzePdf(base64data: string): Promise<AiAnalyzeResponse> {
    let rawText = "";
    try {
      rawText = await parsePdfToText(base64data);
    } catch (err) {
      throw new Error(`Failed to extract text from PDF: ${(err as Error).message}`);
    }

    if (!rawText.trim()) throw new Error("PDF has no extractable text (may be a scanned image)");

    let headers: string[] = [];
    let previewRows: Record<string, string>[] = [];
    let mapping: AiColumnMapping = {};
    let totalRows = 0;

    try {
      const prompt = buildAnalyzePromptForPdf(rawText);
      const aiResponse = await callOpenRouterAi(prompt);
      const parsed = JSON.parse(aiResponse) as {
        mapping?: Record<string, string>;
        detectedCategories?: string[];
        rows?: Record<string, string>[];
      };

      if (parsed.mapping && typeof parsed.mapping === "object") {
        headers = Object.keys(parsed.mapping);
        for (const [col, field] of Object.entries(parsed.mapping)) {
          mapping[col] = (Object.keys(AI_FIELD_HINTS).includes(field) ? field : "") as AiFieldKey | "";
        }
      }

      if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        // Keep ALL extracted rows (capped at MAX_IMPORT_ROWS) so confirm can import the full dataset.
        previewRows = parsed.rows.slice(0, MAX_IMPORT_ROWS) as Record<string, string>[];
        totalRows = previewRows.length;
      }
    } catch (err) {
      logger.warn({ err }, "[MigrationService] PDF AI analysis failed");
      // Fallback: create one row per non-empty line mapped to the "notes" field
      headers = ["raw_text"];
      mapping = { raw_text: "notes" };
      const fallbackLines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
      previewRows = fallbackLines.slice(0, MAX_IMPORT_ROWS).map((line) => ({ raw_text: line }));
      totalRows = previewRows.length || 1;
      if (previewRows.length === 0) previewRows = [{ raw_text: rawText.slice(0, 200) }];
    }

    const detectedCategories = detectCategories(mapping);

    return {
      mapping,
      detectedCategories,
      headers,
      previewRows,
      totalRows,
      isPdf: true,
    };
  }

  async startAiImport(
    clinicId: string,
    base64data: string,
    fileType: FileType,
    mapping: AiColumnMapping,
    detectedCategories: DetectedCategory[],
    preExtractedRows?: Array<Record<string, string>>,
  ): Promise<MigrationJobStatusResponse> {
    let rows: Array<Record<string, string>>;

    if (fileType === "pdf") {
      // For PDF, always use pre-extracted rows from the analyze step to avoid
      // non-deterministic re-extraction and to respect user-reviewed mapping.
      if (preExtractedRows && preExtractedRows.length > 0) {
        rows = preExtractedRows.slice(0, MAX_IMPORT_ROWS);
      } else {
        // Fallback: re-extract from PDF text (without calling AI again) using
        // best-effort line splitting so import never hard-fails if rows omitted.
        let rawText = "";
        try {
          rawText = await parsePdfToText(base64data);
        } catch {
          rawText = "";
        }
        if (!rawText.trim()) throw new Error("PDF has no extractable text and no pre-extracted rows were provided");
        // Build synthetic rows from raw text lines using the provided mapping
        const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
        const firstMappedCol = Object.keys(mapping)[0] ?? "raw_text";
        rows = lines.slice(0, MAX_IMPORT_ROWS).map((line) => ({ [firstMappedCol]: line }));
      }
    } else if (fileType === "xlsx") {
      const buffer = Buffer.from(base64data, "base64");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      if (!workbook.SheetNames.length) throw new Error("Excel file has no sheets");
      const { sheetName, sheet } = this._findFirstDataSheet(workbook);
      logger.debug({ sheetName, totalSheets: workbook.SheetNames.length }, "[MigrationService] Using sheet for import");
      const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
      const headers = (rawRows[0] as string[]).map((h) => String(h ?? "").trim()).filter(Boolean);
      rows = rawRows.slice(1).slice(0, MAX_IMPORT_ROWS).map((rawRow) => {
        const arr = rawRow as string[];
        const cells: Record<string, string> = {};
        headers.forEach((h, i) => { cells[h] = String(arr[i] ?? "").trim(); });
        return cells;
      });
    } else {
      const text = Buffer.from(base64data, "base64").toString("utf-8");
      const { allRows } = parseCsvText(text);
      rows = allRows.slice(0, MAX_IMPORT_ROWS);
    }

    if (rows.length === 0) throw new Error("No data rows found in file");

    const jobId = randomUUID();
    await db.insert(migrationJobsTable).values({
      id: jobId,
      clinicId,
      type: "ai-smart-import",
      status: "pending",
      totalRows: rows.length,
      processedRows: 0,
      successCount: 0,
      errorCount: 0,
      duplicateCount: 0,
    });

    // Always re-derive detectedCategories server-side from the final mapping so
    // that user corrections to column assignments are fully honored.
    const serverCategories = detectCategories(mapping);
    const payload: AiImportJobPayload = { jobId, clinicId, rows, mapping, detectedCategories: serverCategories };

    const migrationQueue = getMigrationQueue();
    if (migrationQueue) {
      await migrationQueue.add(
        "ai-smart-import",
        { type: "ai-smart-import" as const, ...payload },
        { removeOnComplete: 100, removeOnFail: 50 },
      );
    } else {
      setImmediate(() => void this.processAiImportJob(payload));
    }

    return this.getJobStatus(clinicId, jobId);
  }

  async processAiImportJob(payload: AiImportJobPayload): Promise<void> {
    const { jobId, clinicId, rows, mapping, detectedCategories } = payload;
    const errors: Array<{ row: number; message: string }> = [];
    const duplicates: Array<{ phone: string; name?: string }> = [];

    await db
      .update(migrationJobsTable)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(migrationJobsTable.id, jobId));

    let patientCount = 0;
    let procedureCount = 0;
    let templateCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    let processedRows = 0;

    const reverseMapping = (field: AiFieldKey): string | undefined => {
      for (const [col, f] of Object.entries(mapping)) {
        if (f === field) return col;
      }
      return undefined;
    };

    const nameCol           = reverseMapping("name");
    const phoneCol          = reverseMapping("phone");
    const iinCol            = reverseMapping("iin");
    const dobCol            = reverseMapping("dateOfBirth");
    const genderCol         = reverseMapping("gender");
    const sourceCol         = reverseMapping("source");
    const statusCol         = reverseMapping("status");
    const doctorCol         = reverseMapping("doctorName");
    const notesCol          = reverseMapping("notes");
    const procedureNameCol  = reverseMapping("procedureName");
    const procedurePriceCol = reverseMapping("procedurePrice");
    const procStatusCol     = reverseMapping("procedureStatus");
    const scheduledAtCol    = reverseMapping("scheduledAt");
    const paymentMethodCol  = reverseMapping("paymentMethod");
    const procNotesCol      = reverseMapping("procedureNotes");
    const templateNameCol   = reverseMapping("templateName");
    const templatePriceCol  = reverseMapping("templatePrice");
    const templateCatCol    = reverseMapping("templateCategory");

    const includesPatients   = detectedCategories.includes("patients");
    const includesProcedures = detectedCategories.includes("procedures");
    const includesTemplates  = detectedCategories.includes("templates");

    // Phase 0: pre-create doctor stubs for all unique doctor names
    const doctorCache = new Map<string, string | null>(); // name -> userId
    if (doctorCol) {
      const uniqueDoctorNames = [
        ...new Set(rows.map((r) => (r[doctorCol] ?? "").trim()).filter(Boolean)),
      ];
      for (const doctorName of uniqueDoctorNames) {
        const existing = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.name, doctorName)))
          .limit(1);
        if (existing.length > 0) {
          doctorCache.set(doctorName, existing[0]!.id);
        } else {
          const stubEmail = `migrated.${doctorName
            .toLowerCase()
            .replace(/\s+/g, ".")
            .replace(/[^a-z0-9.]/g, "")}.${clinicId.slice(0, 8)}@stub.local`;
          const newId = randomUUID();
          try {
            await db.insert(usersTable).values({
              id: newId,
              clinicId,
              name: doctorName,
              email: stubEmail,
              passwordHash: "!!migrated-stub!!",
              role: "doctor",
            });
            doctorCache.set(doctorName, newId);
          } catch {
            // If email collision or any error, skip stub creation
            doctorCache.set(doctorName, null);
          }
        }
      }
    }

    // Phase 1: pre-populate patient lookup maps from existing patients
    // Maps phone -> patientId and iin -> patientId for fast dedup
    const patientPhoneMap = new Map<string, string>();
    const patientIinMap   = new Map<string, string>();

    if (includesPatients || includesProcedures) {
      const existingPatients = await db
        .select({ id: patientsTable.id, phone: patientsTable.phone, iin: patientsTable.iin })
        .from(patientsTable)
        .where(eq(patientsTable.clinicId, clinicId));
      for (const p of existingPatients) {
        patientPhoneMap.set(p.phone, p.id);
        if (p.iin) patientIinMap.set(p.iin, p.id);
      }
    }

    // Phase 2: pre-populate template lookup map
    const templateNameMap = new Map<string, string>(); // name -> templateId
    if (includesTemplates) {
      const existingTemplates = await db
        .select({ id: procedureTemplatesTable.id, name: procedureTemplatesTable.name })
        .from(procedureTemplatesTable)
        .where(eq(procedureTemplatesTable.clinicId, clinicId));
      for (const t of existingTemplates) {
        templateNameMap.set(t.name.toLowerCase(), t.id);
      }
    }

    const PROC_STATUS_MAP: Record<string, string> = {
      выполнено: "completed", completed: "completed", done: "completed",
      "в процессе": "in_progress", in_progress: "in_progress", "в работе": "in_progress",
      "ожидает оплаты": "pending_payment", pending_payment: "pending_payment",
      отменено: "cancelled", cancelled: "cancelled",
      запланировано: "scheduled", scheduled: "scheduled",
    };

    const PAYMENT_MAP: Record<string, string> = {
      kaspi: "kaspi_transfer", "kaspi transfer": "kaspi_transfer", каспи: "kaspi_transfer",
      "kaspi_transfer": "kaspi_transfer",
      cash: "cash", наличные: "cash", нал: "cash",
      "kaspi qr": "kaspi_qr", kaspi_qr: "kaspi_qr", qr: "kaspi_qr",
      terminal: "terminal", терминал: "terminal", карта: "terminal",
      "kaspi red": "kaspi_red", kaspi_red: "kaspi_red", рассрочка: "kaspi_red",
      debt: "debt", долг: "debt",
    };

    const validSources = new Set(["instagram", "referral", "walk_in", "website", "whatsapp", "other"]);

    try {
      for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
        const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);

        for (const row of batch) {
          processedRows++;
          const rowNum = processedRows;

          try {
            // Template upsert
            if (includesTemplates && templateNameCol) {
              const tName = (row[templateNameCol] ?? "").trim();
              if (tName && !templateNameMap.has(tName.toLowerCase())) {
                const tPrice  = parseFloat(
                  (templatePriceCol ? (row[templatePriceCol] ?? "0") : "0").replace(/[^\d.]/g, ""),
                ) || 0;
                const tCat    = (templateCatCol ? (row[templateCatCol] ?? "") : "").trim() || "other";
                const newTplId = randomUUID();
                await db.insert(procedureTemplatesTable).values({
                  id: newTplId,
                  clinicId,
                  name: tName.slice(0, 200),
                  defaultPrice: tPrice,
                  category: tCat.slice(0, 100),
                  materials: "[]",
                });
                templateNameMap.set(tName.toLowerCase(), newTplId);
                templateCount++;
              }
            }

            // Patient import / lookup
            let patientId: string | undefined;

            if (includesPatients) {
              const rawName  = nameCol  ? (row[nameCol]  ?? "").trim() : "";
              const rawPhone = phoneCol ? (row[phoneCol] ?? "").trim() : "";

              if (!rawName || !rawPhone) {
                errors.push({ row: rowNum, message: `Пропущено имя или телефон: "${rawName}" / "${rawPhone}"` });
                errorCount++;
                continue;
              }

              const phone = normalizePhone(rawPhone);
              if (phone.length < 10) {
                errors.push({ row: rowNum, message: `Некорректный телефон: ${rawPhone}` });
                errorCount++;
                continue;
              }

              const rawIin     = iinCol ? (row[iinCol] ?? "").trim().replace(/\D/g, "").slice(0, 12) : "";
              const iin        = rawIin || undefined;

              // Dedup by phone first, then IIN
              if (patientPhoneMap.has(phone)) {
                patientId = patientPhoneMap.get(phone);
                duplicates.push({ phone, name: rawName });
                duplicateCount++;
              } else if (iin && patientIinMap.has(iin)) {
                patientId = patientIinMap.get(iin);
                duplicates.push({ phone, name: rawName });
                duplicateCount++;
              } else {
                const rawStatus   = statusCol ? (row[statusCol] ?? "") : "";
                const patientStatus = rawStatus ? mapToPatientStatus(rawStatus) : "new_request";
                const rawDoctor   = doctorCol ? (row[doctorCol] ?? "").trim() : "";
                const doctorId    = rawDoctor ? (doctorCache.get(rawDoctor) ?? null) : null;
                const rawGender   = genderCol ? (row[genderCol] ?? "").toLowerCase().trim() : "";
                const gender: "male" | "female" | "other" | undefined =
                  rawGender === "м" || rawGender === "male" || rawGender === "муж" ? "male" :
                  rawGender === "ж" || rawGender === "female" || rawGender === "жен" ? "female" :
                  rawGender ? "other" : undefined;
                const rawDob    = dobCol ? (row[dobCol] ?? "").trim() : "";
                const rawSource = sourceCol ? (row[sourceCol] ?? "").toLowerCase().trim() : "other";
                const source    = validSources.has(rawSource) ? rawSource : "other";
                const rawNotes  = notesCol ? (row[notesCol] ?? "") : "";

                const newPatientId = randomUUID();
                await db.insert(patientsTable).values({
                  id: newPatientId,
                  clinicId,
                  doctorId: doctorId ?? undefined,
                  name: rawName.slice(0, 100),
                  phone,
                  iin,
                  dateOfBirth: rawDob || undefined,
                  gender,
                  source,
                  status: patientStatus as "new_request",
                  notes: rawNotes.slice(0, 500) || undefined,
                });
                patientPhoneMap.set(phone, newPatientId);
                if (iin) patientIinMap.set(iin, newPatientId);
                patientId = newPatientId;
                patientCount++;
              }
            } else if (includesProcedures && phoneCol) {
              // Procedures-only import: find OR create patient so no procedure is lost.
              const rawPhone = (row[phoneCol] ?? "").trim();
              if (rawPhone) {
                const phone = normalizePhone(rawPhone);
                if (patientPhoneMap.has(phone)) {
                  patientId = patientPhoneMap.get(phone);
                } else if (phone.length >= 10) {
                  // Create a minimal patient stub so the procedure can be linked.
                  const rawName    = nameCol ? (row[nameCol] ?? "").trim() : "";
                  const stubName   = rawName.slice(0, 100) || `Пациент ${phone}`;
                  const rawIin     = iinCol ? (row[iinCol] ?? "").trim().replace(/\D/g, "").slice(0, 12) : "";
                  const iin        = rawIin || undefined;
                  const rawDoctor  = doctorCol ? (row[doctorCol] ?? "").trim() : "";
                  const doctorId   = rawDoctor ? (doctorCache.get(rawDoctor) ?? null) : null;
                  const newPatientId = randomUUID();
                  await db.insert(patientsTable).values({
                    id: newPatientId,
                    clinicId,
                    name: stubName,
                    phone,
                    iin,
                    doctorId: doctorId ?? undefined,
                    status: "new_request",
                  });
                  patientPhoneMap.set(phone, newPatientId);
                  if (iin) patientIinMap.set(iin, newPatientId);
                  patientId = newPatientId;
                  patientCount++;
                }
              }
            }

            // Procedure import
            if (includesProcedures && procedureNameCol) {
              const procName = (row[procedureNameCol] ?? "").trim();
              if (procName) {
                if (!patientId) {
                  errors.push({ row: rowNum, message: `Процедура "${procName.slice(0, 50)}" пропущена — не найден пациент` });
                  errorCount++;
                } else {
                  const rawPrice   = procedurePriceCol
                    ? (row[procedurePriceCol] ?? "0").replace(/[^\d.]/g, "")
                    : "0";
                  const price      = parseFloat(rawPrice) || 0;
                  const rawPS      = procStatusCol ? (row[procStatusCol] ?? "").toLowerCase().trim() : "";
                  const procStatus = (PROC_STATUS_MAP[rawPS] ?? "scheduled") as
                    "scheduled" | "completed" | "in_progress" | "pending_payment" | "cancelled";
                  const rawSched   = scheduledAtCol ? (row[scheduledAtCol] ?? "").trim() : "";
                  let scheduledAt: Date | undefined;
                  if (rawSched) {
                    const parsed = new Date(rawSched);
                    if (!isNaN(parsed.getTime())) scheduledAt = parsed;
                  }
                  const rawPay     = paymentMethodCol ? (row[paymentMethodCol] ?? "").toLowerCase().trim() : "";
                  const paymentMethod = (PAYMENT_MAP[rawPay] ?? "cash") as
                    "cash" | "kaspi_transfer" | "kaspi_qr" | "terminal" | "kaspi_red" | "debt";
                  const rawDoctorName = doctorCol ? (row[doctorCol] ?? "").trim() : "";
                  const procDoctorId  = rawDoctorName ? (doctorCache.get(rawDoctorName) ?? null) : null;
                  const procNotes     = procNotesCol ? (row[procNotesCol] ?? "").slice(0, 500) : undefined;

                  await db.insert(proceduresTable).values({
                    id: randomUUID(),
                    clinicId,
                    patientId,
                    doctorId: procDoctorId ?? undefined,
                    name: procName.slice(0, 200),
                    status: procStatus,
                    price,
                    paymentMethod,
                    scheduledAt,
                    notes: procNotes || undefined,
                  });
                  procedureCount++;
                }
              }
            }
          } catch (err) {
            errors.push({ row: rowNum, message: String((err as Error).message).slice(0, 150) });
            errorCount++;
          }
        }

        // Progress update after each batch
        await db
          .update(migrationJobsTable)
          .set({
            processedRows,
            successCount: patientCount + procedureCount + templateCount,
            errorCount,
            duplicateCount,
            updatedAt: new Date(),
          })
          .where(eq(migrationJobsTable.id, jobId));
      }

      await db
        .update(migrationJobsTable)
        .set({
          status: "done",
          processedRows,
          successCount: patientCount + procedureCount + templateCount,
          errorCount,
          duplicateCount,
          report: {
            errors: errors.slice(0, 100),
            duplicates: duplicates.slice(0, 100),
            summary: {
              patients: patientCount,
              procedures: procedureCount,
              templates: templateCount,
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(migrationJobsTable.id, jobId));

      logger.info(
        { jobId, clinicId, patientCount, procedureCount, templateCount, errorCount, duplicateCount },
        "[MigrationService] AI import job done",
      );
    } catch (err) {
      logger.error({ err, jobId }, "[MigrationService] AI import job failed");
      await db
        .update(migrationJobsTable)
        .set({
          status: "failed",
          report: { errors: [{ row: 0, message: String((err as Error).message) }], duplicates: [] },
          updatedAt: new Date(),
        })
        .where(eq(migrationJobsTable.id, jobId));
    }
  }

  async startExcelImport(
    clinicId: string,
    fileBase64: string,
    mapping: ColumnMapping,
  ): Promise<MigrationJobStatusResponse> {
    if (!mapping.name || !mapping.phone) {
      throw new Error("Column mapping must include at least 'name' and 'phone' fields");
    }

    const buffer = Buffer.from(fileBase64, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("Excel file has no sheets");
    const sheet = workbook.Sheets[sheetName]!;
    const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
    const headers = (rawRows[0] as string[]).map((h) => String(h ?? "").trim()).filter(Boolean);
    const allDataRows = rawRows.slice(1).slice(0, MAX_IMPORT_ROWS);
    const rows: ExcelConfirmRow[] = allDataRows.map((rawRow, idx) => {
      const arr = rawRow as string[];
      const cells: Record<string, string> = {};
      headers.forEach((h, i) => { cells[h] = String(arr[i] ?? "").trim(); });
      return { index: idx + 1, cells };
    });

    if (rows.length === 0) throw new Error("No data rows found in Excel file");

    const jobId = randomUUID();
    await db.insert(migrationJobsTable).values({
      id: jobId,
      clinicId,
      type: "excel-import",
      status: "pending",
      totalRows: rows.length,
      processedRows: 0,
      successCount: 0,
      errorCount: 0,
      duplicateCount: 0,
    });

    const payload: ExcelJobPayload = { jobId, clinicId, rows, mapping };

    const migrationQueue = getMigrationQueue();
    if (migrationQueue) {
      await migrationQueue.add("excel-import", { type: "excel-import" as const, ...payload }, { removeOnComplete: 100, removeOnFail: 50 });
    } else {
      setImmediate(() => void this.processExcelJob(payload));
    }

    return this.getJobStatus(clinicId, jobId);
  }

  async processExcelJob(payload: ExcelJobPayload): Promise<void> {
    const { jobId, clinicId, rows, mapping } = payload;
    const errors: Array<{ row: number; message: string }> = [];
    const duplicates: Array<{ phone: string; name?: string }> = [];

    await db
      .update(migrationJobsTable)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(migrationJobsTable.id, jobId));

    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    let processedRows = 0;

    for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
      const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);

      for (const row of batch) {
        processedRows++;
        const rawName = row.cells[mapping.name!] ?? "";
        const rawPhone = row.cells[mapping.phone!] ?? "";
        const rawNotes = mapping.notes ? row.cells[mapping.notes] ?? "" : "";

        if (!rawName || !rawPhone) {
          errors.push({ row: row.index, message: "Missing name or phone" });
          errorCount++;
          continue;
        }

        const phone = normalizePhone(rawPhone);
        if (phone.length < 10) {
          errors.push({ row: row.index, message: `Invalid phone: ${rawPhone}` });
          errorCount++;
          continue;
        }

        const existing = await db
          .select({ id: patientsTable.id })
          .from(patientsTable)
          .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, phone)))
          .limit(1);

        if (existing.length > 0) {
          duplicates.push({ phone, name: rawName });
          duplicateCount++;
          continue;
        }

        const rawStatus = mapping.status ? row.cells[mapping.status] ?? "" : "";
        const patientStatus = rawStatus ? mapToPatientStatus(rawStatus) : "new_request";

        try {
          await db.insert(patientsTable).values({
            id: randomUUID(),
            clinicId,
            name: rawName.slice(0, 100),
            phone,
            notes: rawNotes.slice(0, 500) || undefined,
            status: patientStatus as "new_request",
            source: "other",
          });
          successCount++;
        } catch (err) {
          errors.push({ row: row.index, message: String((err as Error).message).slice(0, 100) });
          errorCount++;
        }
      }

      await db
        .update(migrationJobsTable)
        .set({ processedRows, successCount, errorCount, duplicateCount, updatedAt: new Date() })
        .where(eq(migrationJobsTable.id, jobId));
    }

    await db
      .update(migrationJobsTable)
      .set({
        status: "done",
        processedRows,
        successCount,
        errorCount,
        duplicateCount,
        report: { errors: errors.slice(0, 100), duplicates: duplicates.slice(0, 100) },
        updatedAt: new Date(),
      })
      .where(eq(migrationJobsTable.id, jobId));

    logger.info({ jobId, clinicId, successCount, errorCount, duplicateCount }, "[MigrationService] Excel job done");
  }

  async connectTrello(apiKey: string, token: string): Promise<TrelloConnectResponse> {
    const meRes = await fetch(
      `${TRELLO_BASE_URL}/members/me?key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}&fields=fullName`,
    );
    if (!meRes.ok) {
      throw new Error("Invalid Trello API key or token. Please check your credentials.");
    }
    const me = (await meRes.json()) as { fullName: string };

    const boardsRes = await fetch(
      `${TRELLO_BASE_URL}/members/me/boards?key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}&filter=open&fields=name,shortUrl`,
    );
    if (!boardsRes.ok) throw new Error("Failed to fetch Trello boards");

    const boardsData = (await boardsRes.json()) as Array<{ id: string; name: string; shortUrl: string }>;
    const boards: TrelloBoard[] = boardsData.map((b) => ({ id: b.id, name: b.name, url: b.shortUrl }));

    return { memberName: me.fullName, boards };
  }

  async startTrelloImport(
    clinicId: string,
    apiKey: string,
    token: string,
    boardId: string,
  ): Promise<MigrationJobStatusResponse> {
    const jobId = randomUUID();
    await db.insert(migrationJobsTable).values({
      id: jobId,
      clinicId,
      type: "trello-import",
      status: "pending",
      totalRows: 0,
      processedRows: 0,
      successCount: 0,
      errorCount: 0,
      duplicateCount: 0,
    });

    const payload: TrelloJobPayload = { jobId, clinicId, apiKey, token, boardId };

    const migrationQueue = getMigrationQueue();
    if (migrationQueue) {
      await migrationQueue.add("trello-import", { type: "trello-import" as const, ...payload }, { removeOnComplete: 100, removeOnFail: 50 });
    } else {
      setImmediate(() => void this.processTrelloJob(payload));
    }

    return this.getJobStatus(clinicId, jobId);
  }

  async processTrelloJob(payload: TrelloJobPayload): Promise<void> {
    const { jobId, clinicId, apiKey, token, boardId } = payload;
    const errors: Array<{ row: number; message: string }> = [];
    const duplicates: Array<{ phone: string; name?: string }> = [];

    await db
      .update(migrationJobsTable)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(migrationJobsTable.id, jobId));

    try {
      const listsRes = await fetch(
        `${TRELLO_BASE_URL}/boards/${boardId}/lists?key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}&fields=id,name`,
      );
      if (!listsRes.ok) throw new Error("Failed to fetch Trello lists");
      const lists = (await listsRes.json()) as Array<{ id: string; name: string }>;
      const listMap = Object.fromEntries(lists.map((l) => [l.id, l.name]));

      const cardsRes = await fetch(
        `${TRELLO_BASE_URL}/boards/${boardId}/cards?key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}&fields=name,desc,idList&limit=1000`,
      );
      if (!cardsRes.ok) throw new Error("Failed to fetch Trello cards");
      const cards = (await cardsRes.json()) as Array<{ id: string; name: string; desc: string; idList: string }>;

      await db
        .update(migrationJobsTable)
        .set({ totalRows: cards.length, updatedAt: new Date() })
        .where(eq(migrationJobsTable.id, jobId));

      let successCount = 0;
      let errorCount = 0;
      let duplicateCount = 0;
      let processedRows = 0;

      for (let batchStart = 0; batchStart < cards.length; batchStart += BATCH_SIZE) {
        const batch = cards.slice(batchStart, batchStart + BATCH_SIZE);

        for (const card of batch) {
          processedRows++;
          const name = card.name.trim().slice(0, 100);
          if (!name) {
            errors.push({ row: processedRows, message: "Card has no name" });
            errorCount++;
            continue;
          }

          const phoneMatch = card.desc.match(/(?:\+?[\d\s\-()]{7,15})/);
          const rawPhone = phoneMatch ? phoneMatch[0] : "";
          const phone = rawPhone ? normalizePhone(rawPhone) : `trello-${card.id}`;

          const existing = await db
            .select({ id: patientsTable.id })
            .from(patientsTable)
            .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, phone)))
            .limit(1);

          if (existing.length > 0) {
            duplicates.push({ phone, name });
            duplicateCount++;
            continue;
          }

          const listName = listMap[card.idList] ?? "";
          const patientStatus = mapToPatientStatus(listName);

          try {
            await db.insert(patientsTable).values({
              id: randomUUID(),
              clinicId,
              name,
              phone,
              notes: card.desc.slice(0, 500) || undefined,
              status: patientStatus as "new_request",
              source: "other",
            });
            successCount++;
          } catch (err) {
            errors.push({ row: processedRows, message: String((err as Error).message).slice(0, 100) });
            errorCount++;
          }
        }

        await db
          .update(migrationJobsTable)
          .set({ processedRows, successCount, errorCount, duplicateCount, updatedAt: new Date() })
          .where(eq(migrationJobsTable.id, jobId));
      }

      await db
        .update(migrationJobsTable)
        .set({
          status: "done",
          processedRows,
          successCount,
          errorCount,
          duplicateCount,
          report: { errors: errors.slice(0, 100), duplicates: duplicates.slice(0, 100) },
          updatedAt: new Date(),
        })
        .where(eq(migrationJobsTable.id, jobId));

      logger.info({ jobId, clinicId, successCount, errorCount, duplicateCount }, "[MigrationService] Trello job done");
    } catch (err) {
      logger.error({ err, jobId }, "[MigrationService] Trello job failed");
      await db
        .update(migrationJobsTable)
        .set({
          status: "failed",
          report: { errors: [{ row: 0, message: String((err as Error).message) }], duplicates: [] },
          updatedAt: new Date(),
        })
        .where(eq(migrationJobsTable.id, jobId));
    }
  }

  async getJobStatus(clinicId: string, jobId: string): Promise<MigrationJobStatusResponse> {
    const [job] = await db
      .select()
      .from(migrationJobsTable)
      .where(and(eq(migrationJobsTable.id, jobId), eq(migrationJobsTable.clinicId, clinicId)))
      .limit(1);

    if (!job) throw new Error("Migration job not found");

    return {
      id: job.id,
      clinicId: job.clinicId,
      type: job.type as "excel-import" | "trello-import" | "ai-smart-import",
      status: job.status as "pending" | "processing" | "done" | "failed",
      totalRows: job.totalRows ?? null,
      processedRows: job.processedRows ?? 0,
      successCount: job.successCount ?? 0,
      errorCount: job.errorCount ?? 0,
      duplicateCount: job.duplicateCount ?? 0,
      report: (job.report ?? null) as Record<string, unknown> | null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  async listJobs(clinicId: string): Promise<MigrationJobStatusResponse[]> {
    const jobs = await db
      .select()
      .from(migrationJobsTable)
      .where(eq(migrationJobsTable.clinicId, clinicId))
      .orderBy(migrationJobsTable.createdAt);

    return jobs.map((job) => ({
      id: job.id,
      clinicId: job.clinicId,
      type: job.type as "excel-import" | "trello-import" | "ai-smart-import",
      status: job.status as "pending" | "processing" | "done" | "failed",
      totalRows: job.totalRows ?? null,
      processedRows: job.processedRows ?? 0,
      successCount: job.successCount ?? 0,
      errorCount: job.errorCount ?? 0,
      duplicateCount: job.duplicateCount ?? 0,
      report: (job.report ?? null) as Record<string, unknown> | null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }));
  }
}

export const migrationService = new MigrationService();
