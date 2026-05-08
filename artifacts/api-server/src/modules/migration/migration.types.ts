export type MigrationJobType = "excel-import" | "trello-import" | "ai-smart-import";
export type MigrationJobStatus = "pending" | "processing" | "done" | "failed";
export type FileType = "xlsx" | "csv" | "pdf";

export interface ColumnMapping {
  name?: string;
  phone?: string;
  age?: string;
  notes?: string;
  status?: string;
}

export type AiFieldKey =
  | "name" | "phone" | "iin" | "dateOfBirth" | "gender" | "source" | "status"
  | "doctorName" | "notes"
  | "procedureName" | "procedurePrice" | "procedureStatus" | "scheduledAt"
  | "paymentMethod" | "procedureNotes"
  | "templateName" | "templatePrice" | "templateCategory";

export interface AiColumnMapping {
  [columnHeader: string]: AiFieldKey | "";
}

export type DetectedCategory = "patients" | "procedures" | "templates";

export interface AiAnalyzeResponse {
  mapping: AiColumnMapping;
  detectedCategories: DetectedCategory[];
  headers: string[];
  previewRows: Record<string, string>[];
  totalRows: number;
  isPdf: boolean;
}

export interface AiImportJobPayload {
  jobId: string;
  clinicId: string;
  rows: Array<Record<string, string>>;
  mapping: AiColumnMapping;
  detectedCategories: DetectedCategory[];
}

export interface ExcelPreviewResponse {
  headers: string[];
  rows: Record<string, string>[];
  suggestedMapping: ColumnMapping;
  totalRows: number;
}

export interface ExcelConfirmRow {
  index: number;
  cells: Record<string, string>;
}

export interface TrelloBoard {
  id: string;
  name: string;
  url: string;
}

export interface TrelloConnectResponse {
  boards: TrelloBoard[];
  memberName: string;
}

export interface MigrationJobStatusResponse {
  id: string;
  clinicId: string;
  type: MigrationJobType;
  status: MigrationJobStatus;
  totalRows: number | null;
  processedRows: number;
  successCount: number;
  errorCount: number;
  duplicateCount: number;
  report?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExcelJobPayload {
  jobId: string;
  clinicId: string;
  rows: ExcelConfirmRow[];
  mapping: ColumnMapping;
}

export interface TrelloJobPayload {
  jobId: string;
  clinicId: string;
  apiKey: string;
  token: string;
  boardId: string;
}
