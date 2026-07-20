import type { QueryClient } from "@tanstack/react-query";
import {
  getListPatientsQueryKey,
  getListTeethQueryKey,
  getGetPatientQueryKey,
} from "@workspace/api-client-react";
import type { MatchedOfflineRoute } from "./route-match";
import type { OutboxOp } from "./types";
import { cachePatientTeeth, cachePatientsList, readCachedPatients, readCachedTeeth } from "./clinical-cache";

type PatientRow = Record<string, unknown> & { id?: string };
type ToothRow = Record<string, unknown> & { toothFdi?: number; patientId?: string };

function asPatientsResponse(data: unknown): {
  success: boolean;
  data: { patients: PatientRow[] };
} | null {
  if (!data || typeof data !== "object") return null;
  const bag = data as { success?: boolean; data?: { patients?: unknown } };
  if (!Array.isArray(bag.data?.patients)) return null;
  return {
    success: true,
    data: { patients: bag.data.patients as PatientRow[] },
  };
}

function asTeethResponse(data: unknown): {
  success: boolean;
  data: { teeth: ToothRow[] };
} | null {
  if (!data || typeof data !== "object") return null;
  const bag = data as { success?: boolean; data?: { teeth?: unknown } };
  if (!Array.isArray(bag.data?.teeth)) return null;
  return {
    success: true,
    data: { teeth: bag.data.teeth as ToothRow[] },
  };
}

function asPatientDetail(data: unknown): {
  success: boolean;
  data: { patient: PatientRow; interactions?: unknown[] };
} | null {
  if (!data || typeof data !== "object") return null;
  const bag = data as {
    success?: boolean;
    data?: { patient?: PatientRow; interactions?: unknown[] };
  };
  if (!bag.data?.patient || typeof bag.data.patient !== "object") return null;
  return {
    success: true,
    data: {
      patient: bag.data.patient,
      interactions: Array.isArray(bag.data.interactions)
        ? bag.data.interactions
        : [],
    },
  };
}

/** Apply pending outbox ops onto an in-memory patients list. */
export function applyOutboxToPatients(
  patients: PatientRow[],
  ops: OutboxOp[],
): PatientRow[] {
  let next = patients.map((p) => ({ ...p }));
  for (const op of ops) {
    if (op.type !== "update_patient" && op.type !== "update_patient_status") {
      continue;
    }
    const idx = next.findIndex((p) => p.id === op.resourceId);
    if (idx < 0) continue;
    next[idx] = {
      ...next[idx],
      ...op.payload,
      id: op.resourceId,
      updatedAt: new Date().toISOString(),
      _offlinePending: true,
    };
  }
  return next;
}

/** Apply pending tooth outbox ops onto a teeth list. */
export function applyOutboxToTeeth(
  patientId: string,
  teeth: ToothRow[],
  ops: OutboxOp[],
): ToothRow[] {
  let next = teeth.map((t) => ({ ...t }));
  for (const op of ops) {
    if (op.type !== "update_tooth" || op.resourceId !== patientId) continue;
    const fdi = op.toothFdi;
    if (fdi == null) continue;
    const idx = next.findIndex((t) => Number(t.toothFdi) === fdi);
    const patched: ToothRow = {
      ...(idx >= 0 ? next[idx]! : {}),
      patientId,
      toothFdi: fdi,
      condition: op.payload.condition,
      notes: op.payload.notes ?? null,
      updatedAt: new Date().toISOString(),
      _offlinePending: true,
    };
    if (idx >= 0) next[idx] = patched;
    else next.push(patched);
  }
  return next;
}

/**
 * Patch React Query caches so offline writes stay visible even after
 * onSuccess → invalidateQueries (which would otherwise refetch stale data).
 */
export function applyOptimisticMutationToQueryCache(
  queryClient: QueryClient,
  matched: MatchedOfflineRoute,
  payload: Record<string, unknown>,
  clinicId: string,
): {
  patient?: PatientRow;
  tooth?: ToothRow;
  interaction?: Record<string, unknown>;
} {
  const now = new Date().toISOString();

  if (matched.type === "update_tooth") {
    const key = getListTeethQueryKey(matched.resourceId);
    const prev = asTeethResponse(queryClient.getQueryData(key));
    const teeth = applyOutboxToTeeth(
      matched.resourceId,
      prev?.data.teeth ?? [],
      [
        {
          id: "optimistic",
          type: "update_tooth",
          resourceId: matched.resourceId,
          toothFdi: matched.toothFdi,
          payload,
          url: "",
          method: "PUT",
          clinicId,
          createdAt: now,
          status: "pending",
          attempts: 0,
        },
      ],
    );
    const tooth = teeth.find((t) => Number(t.toothFdi) === matched.toothFdi);
    queryClient.setQueryData(key, { success: true, data: { teeth } });
    void cachePatientTeeth(clinicId, matched.resourceId, teeth);
    return { tooth };
  }

  if (matched.type === "add_interaction") {
    const detailKey = getGetPatientQueryKey(matched.resourceId);
    const prev = asPatientDetail(queryClient.getQueryData(detailKey));
    const interaction = {
      id: `offline_${Date.now()}`,
      patientId: matched.resourceId,
      type: payload.type,
      content: payload.content,
      createdAt: now,
      _offlinePending: true,
    };
    if (prev) {
      queryClient.setQueryData(detailKey, {
        success: true,
        data: {
          patient: prev.data.patient,
          interactions: [...(prev.data.interactions ?? []), interaction],
        },
      });
    }
    return { interaction };
  }

  // patient update / status — merge into list + detail
  const listKey = getListPatientsQueryKey();
  const listPrev = asPatientsResponse(queryClient.getQueryData(listKey));
  const existingFromList = listPrev?.data.patients.find(
    (p) => p.id === matched.resourceId,
  );
  const detailKey = getGetPatientQueryKey(matched.resourceId);
  const detailPrev = asPatientDetail(queryClient.getQueryData(detailKey));
  const basePatient =
    detailPrev?.data.patient ??
    existingFromList ??
    ({ id: matched.resourceId } as PatientRow);

  const patient: PatientRow = {
    ...basePatient,
    ...payload,
    id: matched.resourceId,
    updatedAt: now,
    _offlinePending: true,
  };

  if (listPrev) {
    const patients = listPrev.data.patients.map((p) =>
      p.id === matched.resourceId ? { ...p, ...patient } : p,
    );
    // If patient wasn't in the list yet, keep list as-is (status moves usually are).
    const has = patients.some((p) => p.id === matched.resourceId);
    const nextPatients = has ? patients : [...patients, patient];
    queryClient.setQueryData(listKey, {
      success: true,
      data: { patients: nextPatients },
    });
    void cachePatientsList(clinicId, nextPatients);
  }

  if (detailPrev) {
    queryClient.setQueryData(detailKey, {
      success: true,
      data: {
        patient: { ...detailPrev.data.patient, ...patient },
        interactions: detailPrev.data.interactions ?? [],
      },
    });
  }

  return { patient };
}

/** Build synthetic mutation response using merged entity (not sparse payload-only). */
export function buildMergedOptimisticResponse(
  matched: MatchedOfflineRoute,
  merged: {
    patient?: PatientRow;
    tooth?: ToothRow;
    interaction?: Record<string, unknown>;
  },
  payload: Record<string, unknown>,
): unknown {
  const now = new Date().toISOString();

  if (matched.type === "update_tooth") {
    return {
      success: true,
      data: {
        tooth: merged.tooth ?? {
          patientId: matched.resourceId,
          toothFdi: matched.toothFdi,
          condition: payload.condition,
          notes: payload.notes ?? null,
          updatedAt: now,
          _offlinePending: true,
        },
      },
      offlineQueued: true,
    };
  }

  if (matched.type === "add_interaction") {
    return {
      success: true,
      data: {
        interaction: merged.interaction ?? {
          id: `offline_${Date.now()}`,
          patientId: matched.resourceId,
          type: payload.type,
          content: payload.content,
          createdAt: now,
          _offlinePending: true,
        },
      },
      offlineQueued: true,
    };
  }

  return {
    success: true,
    data: {
      patient: merged.patient ?? {
        id: matched.resourceId,
        ...payload,
        updatedAt: now,
        _offlinePending: true,
      },
    },
    offlineQueued: true,
  };
}

/** Serve offline GET payloads from React Query / IndexedDB + outbox patches. */
export async function resolveOfflineRead(args: {
  url: string;
  clinicId: string | null;
  queryClient: QueryClient;
  pendingOps: OutboxOp[];
}): Promise<unknown | null> {
  const { url, clinicId, queryClient, pendingOps } = args;
  let path = url;
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      path = new URL(url).pathname;
    }
  } catch {
    path = url.split("?")[0] ?? url;
  }
  path = path.split("?")[0] ?? path;

  if (path === "/api/auth/me") {
    const cached = queryClient.getQueryData(["/api/auth/me"]);
    return cached ?? null;
  }

  if (path === "/api/patients") {
    const fromQc = asPatientsResponse(
      queryClient.getQueryData(getListPatientsQueryKey()),
    );
    let patients = fromQc?.data.patients;
    if ((!patients || patients.length === 0) && clinicId) {
      const snap = await readCachedPatients(clinicId);
      patients = (snap?.patients as PatientRow[] | undefined) ?? [];
    }
    if (!patients) return null;
    const patched = applyOutboxToPatients(patients, pendingOps);
    const response = { success: true, data: { patients: patched } };
    queryClient.setQueryData(getListPatientsQueryKey(), response);
    return response;
  }

  const teethMatch = path.match(/^\/api\/patients\/([^/]+)\/teeth\/?$/);
  if (teethMatch) {
    const patientId = teethMatch[1]!;
    const key = getListTeethQueryKey(patientId);
    const fromQc = asTeethResponse(queryClient.getQueryData(key));
    let teeth = fromQc?.data.teeth;
    if ((!teeth || teeth.length === 0) && clinicId) {
      const snap = await readCachedTeeth(clinicId, patientId);
      teeth = (snap?.teeth as ToothRow[] | undefined) ?? [];
    }
    if (!teeth) return null;
    const patched = applyOutboxToTeeth(patientId, teeth, pendingOps);
    const response = { success: true, data: { teeth: patched } };
    queryClient.setQueryData(key, response);
    return response;
  }

  const patientMatch = path.match(/^\/api\/patients\/([^/]+)\/?$/);
  if (patientMatch) {
    const patientId = patientMatch[1]!;
    const detailKey = getGetPatientQueryKey(patientId);
    const fromQc = asPatientDetail(queryClient.getQueryData(detailKey));
    if (fromQc) {
      const [patient] = applyOutboxToPatients([fromQc.data.patient], pendingOps);
      return {
        success: true,
        data: {
          patient: patient ?? fromQc.data.patient,
          interactions: fromQc.data.interactions ?? [],
        },
      };
    }
    // Fallback: synthesize detail from patients list cache.
    if (clinicId) {
      const list =
        asPatientsResponse(queryClient.getQueryData(getListPatientsQueryKey()))
          ?.data.patients ??
        ((await readCachedPatients(clinicId))?.patients as PatientRow[] | undefined) ??
        [];
      const found = applyOutboxToPatients(list, pendingOps).find(
        (p) => p.id === patientId,
      );
      if (found) {
        const response = {
          success: true,
          data: { patient: found, interactions: [] as unknown[] },
        };
        queryClient.setQueryData(detailKey, response);
        return response;
      }
    }
  }

  // Users list is small and often needed for labels — serve from RQ cache only.
  if (path === "/api/users") {
    return queryClient.getQueryData(["/api/users"]) ?? null;
  }

  return null;
}
