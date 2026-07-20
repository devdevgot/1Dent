import { idbDelete, idbGetAll, idbPut, STORE_OUTBOX } from "./idb";
import type { OfflineOpType, OutboxOp, OutboxStatus } from "./types";

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueOutboxOp(input: {
  type: OfflineOpType;
  resourceId: string;
  toothFdi?: number;
  baseUpdatedAt?: string | null;
  payload: Record<string, unknown>;
  url: string;
  method: string;
  clinicId: string;
}): Promise<OutboxOp> {
  // Coalesce: keep a single pending op per entity+type so rapid offline edits merge.
  const existing = await listOutbox();
  const coalescable = existing.find(
    (op) =>
      op.status === "pending" &&
      op.type === input.type &&
      op.resourceId === input.resourceId &&
      (input.toothFdi == null || op.toothFdi === input.toothFdi),
  );

  if (coalescable && input.type !== "add_interaction") {
    const merged: OutboxOp = {
      ...coalescable,
      payload: { ...coalescable.payload, ...input.payload },
      // Keep the earliest base so we still detect intervening remote edits.
      baseUpdatedAt: coalescable.baseUpdatedAt ?? input.baseUpdatedAt,
      url: input.url,
      method: input.method,
      createdAt: coalescable.createdAt,
    };
    await idbPut(STORE_OUTBOX, merged);
    emit();
    return merged;
  }

  const op: OutboxOp = {
    id: newId(),
    type: input.type,
    resourceId: input.resourceId,
    toothFdi: input.toothFdi,
    baseUpdatedAt: input.baseUpdatedAt,
    payload: input.payload,
    url: input.url,
    method: input.method,
    clinicId: input.clinicId,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
  await idbPut(STORE_OUTBOX, op);
  emit();
  return op;
}

export async function listOutbox(): Promise<OutboxOp[]> {
  try {
    const all = await idbGetAll<OutboxOp>(STORE_OUTBOX);
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function listPendingOutbox(clinicId?: string): Promise<OutboxOp[]> {
  const all = await listOutbox();
  return all.filter(
    (op) =>
      // "syncing" is treated as pending so a crashed flush can retry.
      (op.status === "pending" ||
        op.status === "failed" ||
        op.status === "syncing") &&
      (!clinicId || op.clinicId === clinicId),
  );
}

export async function listConflictOutbox(clinicId?: string): Promise<OutboxOp[]> {
  const all = await listOutbox();
  return all.filter(
    (op) => op.status === "conflict" && (!clinicId || op.clinicId === clinicId),
  );
}

export async function updateOutboxOp(
  id: string,
  patch: Partial<Pick<OutboxOp, "status" | "attempts" | "lastError" | "conflictData" | "payload" | "baseUpdatedAt">>,
): Promise<void> {
  const all = await listOutbox();
  const op = all.find((o) => o.id === id);
  if (!op) return;
  await idbPut(STORE_OUTBOX, { ...op, ...patch });
  emit();
}

export async function removeOutboxOp(id: string): Promise<void> {
  await idbDelete(STORE_OUTBOX, id);
  emit();
}

export async function countOutboxByStatus(
  status: OutboxStatus | OutboxStatus[],
  clinicId?: string,
): Promise<number> {
  const statuses = Array.isArray(status) ? status : [status];
  const all = await listOutbox();
  return all.filter(
    (op) =>
      statuses.includes(op.status) && (!clinicId || op.clinicId === clinicId),
  ).length;
}
