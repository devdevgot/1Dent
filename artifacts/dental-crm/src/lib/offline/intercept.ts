import {
  setOfflineMutationInterceptor,
  setRequestBodyRewriter,
} from "@workspace/api-client-react";
import { enqueueOutboxOp } from "./outbox";
import { matchOfflineMutation } from "./route-match";
import {
  getEntityVersion,
  patientVersionKey,
  toothVersionKey,
} from "./entity-versions";
import { isOnline } from "./online";

let clinicIdGetter: (() => string | null) | null = null;
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

function buildOptimisticResponse(
  matched: NonNullable<ReturnType<typeof matchOfflineMutation>>,
  payload: Record<string, unknown>,
): unknown {
  const now = new Date().toISOString();

  if (matched.type === "update_tooth") {
    return {
      success: true,
      data: {
        tooth: {
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
        interaction: {
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

  // patient update / status
  return {
    success: true,
    data: {
      patient: {
        id: matched.resourceId,
        ...payload,
        updatedAt: now,
        _offlinePending: true,
      },
    },
    offlineQueued: true,
  };
}

export function installOfflineFetchInterceptors(options: {
  getClinicId: () => string | null;
}): void {
  clinicIdGetter = options.getClinicId;
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
    // Only queue when we believe we're offline / network failed.
    // Online path with body rewriter still injects baseUpdatedAt.
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

    return buildOptimisticResponse(matched, rest);
  });
}

export function shouldQueueForOffline(): boolean {
  return !isOnline();
}
