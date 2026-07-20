export type OfflineOpType =
  | "update_patient"
  | "update_patient_status"
  | "update_tooth"
  | "add_interaction";

export type OutboxStatus = "pending" | "syncing" | "conflict" | "failed";

export interface OutboxOp {
  id: string;
  type: OfflineOpType;
  /** Usually patient id */
  resourceId: string;
  toothFdi?: number;
  /** Last-seen server updatedAt when the edit was made offline */
  baseUpdatedAt?: string | null;
  payload: Record<string, unknown>;
  /** Original request URL (for debugging / individual replay) */
  url: string;
  method: string;
  clinicId: string;
  createdAt: string;
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  conflictData?: unknown;
}

export interface CachedPatientsSnapshot {
  clinicId: string;
  savedAt: string;
  patients: unknown[];
}

export interface CachedTeethSnapshot {
  clinicId: string;
  patientId: string;
  savedAt: string;
  teeth: unknown[];
}

export interface SyncConflict {
  outboxId: string;
  type: OfflineOpType;
  resourceId: string;
  toothFdi?: number;
  localPayload: Record<string, unknown>;
  serverCurrent: unknown;
  message: string;
}

export interface OfflineSyncState {
  online: boolean;
  pendingCount: number;
  conflictCount: number;
  syncing: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}
