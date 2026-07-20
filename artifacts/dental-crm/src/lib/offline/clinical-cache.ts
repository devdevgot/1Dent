import { idbGet, idbPut, STORE_PATIENTS, STORE_TEETH } from "./idb";
import type { CachedPatientsSnapshot, CachedTeethSnapshot } from "./types";
import { rememberPatients, rememberTeeth } from "./entity-versions";

export async function cachePatientsList(
  clinicId: string,
  patients: unknown[],
): Promise<void> {
  const snapshot: CachedPatientsSnapshot = {
    clinicId,
    savedAt: new Date().toISOString(),
    patients,
  };
  await idbPut(STORE_PATIENTS, snapshot);
  rememberPatients(
    patients as Array<{ id?: string; updatedAt?: string | Date | null }>,
  );
}

export async function readCachedPatients(
  clinicId: string,
): Promise<CachedPatientsSnapshot | undefined> {
  return idbGet<CachedPatientsSnapshot>(STORE_PATIENTS, clinicId);
}

export async function cachePatientTeeth(
  clinicId: string,
  patientId: string,
  teeth: unknown[],
): Promise<void> {
  const snapshot: CachedTeethSnapshot = {
    clinicId,
    patientId,
    savedAt: new Date().toISOString(),
    teeth,
  };
  await idbPut(STORE_TEETH, snapshot);
  rememberTeeth(
    patientId,
    teeth as Array<{ toothFdi?: number; updatedAt?: string | Date | null }>,
  );
}

export async function readCachedTeeth(
  clinicId: string,
  patientId: string,
): Promise<CachedTeethSnapshot | undefined> {
  return idbGet<CachedTeethSnapshot>(STORE_TEETH, [clinicId, patientId]);
}
