export type MigrationJobType = "excel" | "trello";
export type MigrationJobStatus = "pending" | "running" | "done" | "failed";

export interface ColumnMapping {
  name?: string;
  phone?: string;
  age?: string;
  notes?: string;
  status?: string;
}

export interface ExcelPreviewRow {
  index: number;
  cells: Record<string, string>;
}

export interface ExcelPreviewResponse {
  headers: string[];
  rows: ExcelPreviewRow[];
  detectedMapping: ColumnMapping;
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
  type: MigrationJobType;
  status: MigrationJobStatus;
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  duplicateCount: number;
  report?: {
    errors: Array<{ row: number; message: string }>;
    duplicates: Array<{ phone: string; name?: string }>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ExcelJobPayload {
  jobId: string;
  clinicId: string;
  rows: ExcelPreviewRow[];
  mapping: ColumnMapping;
}

export interface TrelloJobPayload {
  jobId: string;
  clinicId: string;
  apiKey: string;
  token: string;
  boardId: string;
}
