import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListPatientsQueryKey } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  addServiceWorkerMessageHandler,
  requestOutboxBackgroundSync,
} from "@/lib/pwa";
import {
  cachePatientTeeth,
  cachePatientsList,
  clearEntityVersions,
  clearOfflineData,
  configureOfflineSync,
  flushOutbox,
  installOfflineFetchInterceptors,
  listPendingOutbox,
  readCachedPatients,
  rememberPatients,
  rememberTeeth,
  startOfflineSync,
} from "@/lib/offline";
import { applyOutboxToPatients } from "@/lib/offline/optimistic-cache";
import { OfflineBanner } from "./offline-banner";
import { SyncConflictDialog } from "./sync-conflict-dialog";

export function OfflineSyncProvider() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const clinicId = user?.clinicId ?? null;

  useEffect(() => {
    installOfflineFetchInterceptors({
      getClinicId: () => useAuthStore.getState().user?.clinicId ?? null,
      queryClient,
    });

    configureOfflineSync({
      getClinicId: () => useAuthStore.getState().user?.clinicId ?? null,
      onApplied: () => {
        void queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        void queryClient.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === "string" &&
            (q.queryKey[0].includes("/teeth") ||
              q.queryKey[0].startsWith("/api/patients/")),
        });
      },
    });

    void startOfflineSync();

    const removeSwHandler = addServiceWorkerMessageHandler((data) => {
      if (data.type === "FLUSH_OUTBOX") {
        void flushOutbox();
      }
    });
    requestOutboxBackgroundSync();

    return () => {
      removeSwHandler();
    };
  }, [queryClient]);

  // Hydrate clinical cache on login; mirror successful queries to IDB.
  useEffect(() => {
    if (!clinicId) return;

    let cancelled = false;

    const hydrate = async () => {
      const existing = queryClient.getQueryData(getListPatientsQueryKey()) as
        | { data?: { patients?: unknown[] } }
        | undefined;
      const hasPatients = Array.isArray(existing?.data?.patients)
        && existing.data.patients.length > 0;

      const cached = await readCachedPatients(clinicId);
      if (cancelled || !cached?.patients?.length) return;

      rememberPatients(
        cached.patients as Array<{ id?: string; updatedAt?: string }>,
      );

      // Always prefer hydrating when offline or when RQ has no patients yet.
      const offline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      if (offline || !hasPatients) {
        const pending = await listPendingOutbox(clinicId);
        const patients = applyOutboxToPatients(
          cached.patients as Array<Record<string, unknown> & { id?: string }>,
          pending,
        );
        queryClient.setQueryData(getListPatientsQueryKey(), {
          success: true,
          data: { patients },
        });
      }
    };

    void hydrate();

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      const query = event.query;
      if (query.state.status !== "success") return;
      const key = query.queryKey[0];
      if (typeof key !== "string") return;

      if (key === "/api/patients") {
        const data = query.state.data as
          | { data?: { patients?: unknown[] } }
          | undefined;
        const patients = data?.data?.patients;
        if (Array.isArray(patients) && patients.length > 0) {
          // Don't persist sparse optimistic-only lists without real fields.
          const sample = patients[0] as { name?: unknown } | undefined;
          if (sample && typeof sample.name === "string") {
            void cachePatientsList(clinicId, patients);
          }
        }
        return;
      }

      const teethMatch = key.match(/^\/api\/patients\/([^/]+)\/teeth$/);
      if (teethMatch) {
        const patientId = teethMatch[1]!;
        const data = query.state.data as
          | { data?: { teeth?: unknown[] } }
          | undefined;
        const teeth = data?.data?.teeth;
        if (Array.isArray(teeth)) {
          rememberTeeth(
            patientId,
            teeth as Array<{ toothFdi?: number; updatedAt?: string }>,
          );
          void cachePatientTeeth(clinicId, patientId, teeth);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [clinicId, queryClient]);

  // Flush when auth becomes available / clinic switches.
  useEffect(() => {
    if (!clinicId) {
      clearEntityVersions();
      return;
    }
    void flushOutbox();
  }, [clinicId]);

  return (
    <>
      <OfflineBanner />
      <SyncConflictDialog />
    </>
  );
}

/** Call from logout / 401 handlers. */
export async function wipeOfflineOnLogout(): Promise<void> {
  clearEntityVersions();
  await clearOfflineData();
}
