import { customFetch } from "@workspace/api-client-react";
import { requestOutboxBackgroundSync } from "@/lib/pwa";
import {
  listConflictOutbox,
  listPendingOutbox,
  removeOutboxOp,
  subscribeOutbox,
  updateOutboxOp,
} from "./outbox";
import { isOnline, subscribeOnlineStatus } from "./online";
import type { OfflineSyncState, OutboxOp, SyncConflict } from "./types";
import {
  getEntityVersion,
  patientVersionKey,
  rememberPatientVersion,
  rememberToothVersion,
  toothVersionKey,
} from "./entity-versions";

type Listener = () => void;

const listeners = new Set<Listener>();

let state: OfflineSyncState = {
  online: isOnline(),
  pendingCount: 0,
  conflictCount: 0,
  syncing: false,
  lastSyncedAt: null,
  lastError: null,
};

let conflicts: SyncConflict[] = [];
let flushPromise: Promise<void> | null = null;
let clinicIdGetter: (() => string | null) | null = null;
let onApplied: (() => void) | null = null;
let started = false;

function emit(): void {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<OfflineSyncState>): void {
  state = { ...state, ...patch };
  emit();
}

export function getOfflineSyncState(): OfflineSyncState {
  return state;
}

export function getSyncConflicts(): SyncConflict[] {
  return conflicts;
}

export function subscribeOfflineSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function configureOfflineSync(options: {
  getClinicId: () => string | null;
  onApplied?: () => void;
}): void {
  clinicIdGetter = options.getClinicId;
  onApplied = options.onApplied ?? null;
}

async function refreshCounts(): Promise<void> {
  const clinicId = clinicIdGetter?.() ?? undefined;
  // Without an authenticated clinic, do not surface another session's outbox.
  if (!clinicId) {
    conflicts = [];
    setState({ pendingCount: 0, conflictCount: 0 });
    return;
  }
  const pending = await listPendingOutbox(clinicId);
  const conflictOps = await listConflictOutbox(clinicId);
  conflicts = conflictOps.map((op) => ({
    outboxId: op.id,
    type: op.type,
    resourceId: op.resourceId,
    toothFdi: op.toothFdi,
    localPayload: op.payload,
    serverCurrent: extractServerCurrent(op.conflictData),
    message: op.lastError || "Конфликт версий",
  }));
  setState({
    pendingCount: pending.length,
    conflictCount: conflicts.length,
  });
}

function extractServerCurrent(conflictData: unknown): unknown {
  if (!conflictData || typeof conflictData !== "object") return conflictData;
  const data = conflictData as Record<string, unknown>;
  if ("current" in data) return data.current;
  return conflictData;
}

function toSyncPayload(op: OutboxOp) {
  const payload = { ...op.payload };
  delete payload.baseUpdatedAt;
  return {
    clientOpId: op.id,
    type: op.type,
    resourceId: op.resourceId,
    toothFdi: op.toothFdi,
    baseUpdatedAt:
      op.baseUpdatedAt ??
      (op.type === "update_tooth" && op.toothFdi != null
        ? getEntityVersion(toothVersionKey(op.resourceId, op.toothFdi))
        : getEntityVersion(patientVersionKey(op.resourceId))) ??
      null,
    payload,
    clientTimestamp: op.createdAt,
  };
}

function rememberApplied(op: OutboxOp, data: unknown): void {
  if (!data || typeof data !== "object") return;
  const bag = data as Record<string, unknown>;
  if (bag.patient && typeof bag.patient === "object") {
    rememberPatientVersion(bag.patient as { id?: string; updatedAt?: string });
  }
  if (bag.tooth && typeof bag.tooth === "object") {
    rememberToothVersion(bag.tooth as {
      patientId?: string;
      toothFdi?: number;
      updatedAt?: string;
    });
  }
  // Also bump local base for patient ops from nested patient.
  if (op.type.startsWith("update_patient") && bag.patient) {
    rememberPatientVersion(bag.patient as { id?: string; updatedAt?: string });
  }
}

async function applyConflict(op: OutboxOp, data: unknown, message: string): Promise<void> {
  await updateOutboxOp(op.id, {
    status: "conflict",
    lastError: message,
    conflictData: data,
  });
}

export async function flushOutbox(): Promise<void> {
  if (flushPromise) return flushPromise;
  if (!isOnline()) {
    setState({ online: false });
    return;
  }

  flushPromise = (async () => {
    const clinicId = clinicIdGetter?.();
    if (!clinicId) {
      await refreshCounts();
      return;
    }

    setState({ syncing: true, online: true, lastError: null });
    const pending = await listPendingOutbox(clinicId);
    if (pending.length === 0) {
      await refreshCounts();
      setState({ syncing: false });
      return;
    }

    for (const op of pending) {
      await updateOutboxOp(op.id, { status: "syncing", attempts: op.attempts + 1 });
    }

    try {
      type SyncPushResult = {
        clientOpId: string;
        status: "applied" | "conflict" | "error" | "skipped";
        data?: unknown;
        error?: string;
        code?: string;
      };
      type SyncPushResponse = {
        success: boolean;
        data: { results: SyncPushResult[] };
      };

      const response = await customFetch<SyncPushResponse>("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: pending.map(toSyncPayload) }),
        responseType: "json",
      });

      const results: SyncPushResult[] = response.data?.results ?? [];
      const byId = new Map<string, SyncPushResult>(
        results.map((r: SyncPushResult) => [r.clientOpId, r]),
      );
      let appliedAny = false;

      for (const op of pending) {
        const result: SyncPushResult | undefined = byId.get(op.id);
        if (!result) {
          await updateOutboxOp(op.id, {
            status: "failed",
            lastError: "Нет ответа сервера для операции",
          });
          continue;
        }
        if (result.status === "applied") {
          rememberApplied(op, result.data);
          await removeOutboxOp(op.id);
          appliedAny = true;
        } else if (result.status === "conflict") {
          await applyConflict(
            op,
            result.data,
            result.error || "Конфликт: запись изменена другим пользователем",
          );
        } else {
          await updateOutboxOp(op.id, {
            status: "failed",
            lastError: result.error || "Ошибка синхронизации",
          });
        }
      }

      if (appliedAny) onApplied?.();
      setState({
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка синхронизации";
      for (const op of pending) {
        await updateOutboxOp(op.id, { status: "failed", lastError: message });
      }
      setState({ lastError: message });
    } finally {
      await refreshCounts();
      setState({ syncing: false });
    }
  })().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
}

/**
 * Resolve a conflict by keeping the local offline edit (force with fresh base)
 * or discarding it in favor of the server version.
 */
export async function resolveConflict(
  outboxId: string,
  resolution: "keep_local" | "keep_server",
): Promise<void> {
  const conflictOps = await listConflictOutbox();
  const op = conflictOps.find((o) => o.id === outboxId);
  if (!op) return;

  if (resolution === "keep_server") {
    const current = extractServerCurrent(op.conflictData);
    if (current && typeof current === "object") {
      if (op.type === "update_tooth") {
        rememberToothVersion(current as {
          patientId?: string;
          toothFdi?: number;
          updatedAt?: string;
        });
      } else {
        rememberPatientVersion(current as { id?: string; updatedAt?: string });
      }
    }
    await removeOutboxOp(outboxId);
    onApplied?.();
    await refreshCounts();
    return;
  }

  // keep_local — retry with the server's current updatedAt as the new base
  const current = extractServerCurrent(op.conflictData) as
    | { updatedAt?: string }
    | undefined;
  const freshBase =
    current?.updatedAt ??
    (typeof current === "object" && current && "updatedAt" in current
      ? String((current as { updatedAt?: unknown }).updatedAt)
      : undefined);

  await updateOutboxOp(outboxId, {
    status: "pending",
    baseUpdatedAt: freshBase ?? op.baseUpdatedAt,
    lastError: undefined,
    conflictData: undefined,
  });
  await refreshCounts();
  await flushOutbox();
}

export async function startOfflineSync(): Promise<void> {
  if (started) return;
  started = true;
  setState({ online: isOnline() });
  await refreshCounts();

  subscribeOnlineStatus(() => {
    const online = isOnline();
    setState({ online });
    if (online) {
      void flushOutbox();
    } else {
      requestOutboxBackgroundSync();
    }
  });

  subscribeOutbox(() => {
    void refreshCounts();
    if (!isOnline()) {
      requestOutboxBackgroundSync();
    }
  });

  if (isOnline()) {
    void flushOutbox();
  } else {
    requestOutboxBackgroundSync();
  }
}
