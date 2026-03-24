export type MigrationJobType = "excel-import" | "trello-import";
export type MigrationJobStatus = "pending" | "processing" | "done" | "failed";

export interface ColumnMapping {
  name?: string;
  phone?: string;
  age?: string;
  notes?: string;
  status?: string;
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
