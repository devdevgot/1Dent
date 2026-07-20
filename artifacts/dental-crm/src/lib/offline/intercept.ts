import type { QueryClient } from "@tanstack/react-query";
import {
  setOfflineMutationInterceptor,
  setOfflineReadInterceptor,
  setRequestBodyRewriter,
} from "@workspace/api-client-react";
import { enqueueOutboxOp, listPendingOutbox } from "./outbox";
import { matchOfflineMutation } from "./route-match";
import {
  getEntityVersion,
  patientVersionKey,
  toothVersionKey,
} from "./entity-versions";
import {
  applyOptimisticMutationToQueryCache,
  buildMergedOptimisticResponse,
  resolveOfflineRead,
} from "./optimistic-cache";

let clinicIdGetter: (() => string | null) | null = null;
let queryClientRef: QueryClient | null = null;
let installed = false;

function parseBody(body: string | null): Record<string, unknown> {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {};
}

function injectBaseUpdatedAt(
  url: string,
  method: string,
  body: string | null,
): string | null {
  if (body == null) return body;
  const matched = matchOfflineMutation(method, url);
  if (!matched) return body;

  const payload = parseBody(body);
  if (typeof payload.baseUpdatedAt === "string" && payload.baseUpdatedAt) {
    return body;
  }

  const version =
    matched.type === "update_tooth"
      ? getEntityVersion(toothVersionKey(matched.resourceId, matched.toothFdi))
      : getEntityVersion(patientVersionKey(matched.resourceId));

  if (!version) return body;

  return JSON.stringify({ ...payload, baseUpdatedAt: version });
}

export function installOfflineFetchInterceptors(options: {
  getClinicId: () => string | null;
  queryClient: QueryClient;
}): void {
  // Always refresh getters — provider remount / HMR must not keep a stale
  // QueryClient reference from the first install.
  clinicIdGetter = options.getClinicId;
  queryClientRef = options.queryClient;

  if (installed) return;
  installed = true;

  setRequestBodyRewriter(
    ({
      url,
      method,
      body,
    }: {
      url: string;
      method: string;
      body: string | null;
    }) => injectBaseUpdatedAt(url, method, body),
  );

  setOfflineReadInterceptor(async ({ url, method }) => {
    if (method.toUpperCase() !== "GET") return null;
    const qc = queryClientRef;
    if (!qc) return null;
    const clinicId = clinicIdGetter?.() ?? null;
    const pending = clinicId ? await listPendingOutbox(clinicId) : [];
    return resolveOfflineRead({
      url,
      clinicId,
      queryClient: qc,
      pendingOps: pending,
    });
  });

  setOfflineMutationInterceptor(async ({
    url,
    method,
    body,
  }: {
    url: string;
    method: string;
    body: string | null;
    headers: Headers;
  }) => {
    const matched = matchOfflineMutation(method, url);
    if (!matched) return null;

    const clinicId = clinicIdGetter?.();
    if (!clinicId) return null;

    const payload = parseBody(body);
    const baseUpdatedAt =
      typeof payload.baseUpdatedAt === "string"
        ? payload.baseUpdatedAt
        : matched.type === "update_tooth"
          ? getEntityVersion(
              toothVersionKey(matched.resourceId, matched.toothFdi),
            )
          : getEntityVersion(patientVersionKey(matched.resourceId));

    const { baseUpdatedAt: _drop, ...rest } = payload;
    void _drop;

    await enqueueOutboxOp({
      type: matched.type,
      resourceId: matched.resourceId,
      toothFdi: matched.type === "update_tooth" ? matched.toothFdi : undefined,
      baseUpdatedAt: baseUpdatedAt ?? null,
      payload: rest,
      url,
      method,
      clinicId,
    });

    const qc = queryClientRef;
    const merged = qc
      ? applyOptimisticMutationToQueryCache(qc, matched, rest, clinicId)
      : {};

    return buildMergedOptimisticResponse(matched, merged, rest);
  });
}
