import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import { db, patientsTable, migrationJobsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger";
import type {
  ColumnMapping,
  ExcelPreviewRow,
  ExcelPreviewResponse,
  TrelloBoard,
  TrelloConnectResponse,
  MigrationJobStatusResponse,
  ExcelJobPayload,
  TrelloJobPayload,
} from "./migration.types";
import { getMigrationQueue } from "./migration.queue";

const PREVIEW_ROWS = 20;
const BATCH_SIZE = 50;
const MAX_IMPORT_ROWS = 5000;

const TRELLO_BASE_URL = "https://api.trello.com/1";

const NAME_HINTS = ["имя", "фио", "name", "пациент", "patient", "ф.и.о", "fullname", "full_name"];
const PHONE_HINTS = ["телефон", "phone", "тел", "мобильный", "номер", "mobile", "number", "contact"];
const AGE_HINTS = ["возраст", "age", "лет", "year", "год"];
const NOTES_HINTS = ["примечания", "заметки", "notes", "комментарий", "comment", "описание"];
const STATUS_HINTS = ["статус", "status", "этап", "stage", "состояние"];

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

function trelloListToStatus(listName: string): string {
  const lower = listName.toLowerCase().trim();
  return TRELLO_STATUS_MAP[lower] ?? "new_request";
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

    const dataRows = rawRows.slice(1, PREVIEW_ROWS + 1);
    const rows: ExcelPreviewRow[] = dataRows.map((rawRow, idx) => {
      const arr = rawRow as string[];
      const cells: Record<string, string> = {};
      headers.forEach((h, i) => {
        cells[h] = String(arr[i] ?? "").trim();
      });
      return { index: idx + 1, cells };
    });

    return {
      headers,
      rows,
      detectedMapping: detectMapping(headers),
    };
  }

  async startExcelImport(
    clinicId: string,
    rows: ExcelPreviewRow[],
    mapping: ColumnMapping,
  ): Promise<MigrationJobStatusResponse> {
    if (!mapping.name || !mapping.phone) {
      throw new Error("Column mapping must include at least 'name' and 'phone' fields");
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new Error(`Too many rows: max ${MAX_IMPORT_ROWS}`);
    }

    const jobId = randomUUID();
    await db.insert(migrationJobsTable).values({
      id: jobId,
      clinicId,
      type: "excel",
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
      .set({ status: "running", updatedAt: new Date() })
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
        const rawAge = mapping.age ? row.cells[mapping.age] ?? "" : "";
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

        const age = rawAge ? parseInt(rawAge, 10) : undefined;

        try {
          await db.insert(patientsTable).values({
            id: randomUUID(),
            clinicId,
            name: rawName.slice(0, 100),
            phone,
            age: isNaN(age!) ? undefined : age,
            notes: rawNotes.slice(0, 500) || undefined,
            status: "new_request",
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
      type: "trello",
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
      .set({ status: "running", updatedAt: new Date() })
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
          const status = trelloListToStatus(listName) as Parameters<typeof db.insert>[0] extends unknown ? string : never;

          try {
            await db.insert(patientsTable).values({
              id: randomUUID(),
              clinicId,
              name,
              phone,
              notes: card.desc.slice(0, 500) || undefined,
              status: status as "new_request",
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
      type: job.type as "excel" | "trello",
      status: job.status as "pending" | "running" | "done" | "failed",
      totalRows: job.totalRows ?? 0,
      processedRows: job.processedRows ?? 0,
      successCount: job.successCount ?? 0,
      errorCount: job.errorCount ?? 0,
      duplicateCount: job.duplicateCount ?? 0,
      report: job.report ?? undefined,
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
      type: job.type as "excel" | "trello",
      status: job.status as "pending" | "running" | "done" | "failed",
      totalRows: job.totalRows ?? 0,
      processedRows: job.processedRows ?? 0,
      successCount: job.successCount ?? 0,
      errorCount: job.errorCount ?? 0,
      duplicateCount: job.duplicateCount ?? 0,
      report: job.report ?? undefined,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }));
  }
}

export const migrationService = new MigrationService();
