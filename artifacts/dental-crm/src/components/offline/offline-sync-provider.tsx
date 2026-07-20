import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListPatientsQueryKey } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  requestOutboxBackgroundSync,
  setServiceWorkerMessageHandler,
} from "@/lib/pwa";
import {
  cachePatientTeeth,
  cachePatientsList,
  clearEntityVersions,
  clearOfflineData,
  configureOfflineSync,
  flushOutbox,
  installOfflineFetchInterceptors,
  readCachedPatients,
  rememberPatients,
  rememberTeeth,
  startOfflineSync,
} from "@/lib/offline";
import { OfflineBanner } from "./offline-banner";
import { SyncConflictDialog } from "./sync-conflict-dialog";

let interceptorsInstalled = false;

export function OfflineSyncProvider() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const clinicId = user?.clinicId ?? null;

  useEffect(() => {
    if (!interceptorsInstalled) {
      installOfflineFetchInterceptors({
        getClinicId: () => useAuthStore.getState().user?.clinicId ?? null,
      });
      interceptorsInstalled = true;
    }

    configureOfflineSync({
      getClinicId: () => useAuthStore.getState().user?.clinicId ?? null,
      onApplied: () => {
        void queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        void queryClient.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === "string" &&
            q.queryKey[0].includes("/teeth"),
        });
      },
    });

    void startOfflineSync();

    setServiceWorkerMessageHandler((data) => {
      if (data.type === "FLUSH_OUTBOX") {
        void flushOutbox();
      }
    });
    requestOutboxBackgroundSync();

    return () => {
      setServiceWorkerMessageHandler(null);
    };
  }, [queryClient]);

  // Hydrate clinical cache when offline / on login; mirror successful queries to IDB.
  useEffect(() => {
    if (!clinicId) return;

    let cancelled = false;

    const hydrate = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const cached = await readCachedPatients(clinicId);
        if (!cancelled && cached?.patients?.length) {
          rememberPatients(
            cached.patients as Array<{ id?: string; updatedAt?: string }>,
          );
          queryClient.setQueryData(getListPatientsQueryKey(), {
            success: true,
            data: { patients: cached.patients },
          });
        }
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
        if (Array.isArray(patients)) {
          void cachePatientsList(clinicId, patients);
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
