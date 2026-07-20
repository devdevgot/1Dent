/**
 * In-memory registry of last-seen entity updatedAt values.
 * Used to inject baseUpdatedAt into mutating requests for conflict detection.
 */

const versions = new Map<string, string>();

export function patientVersionKey(patientId: string): string {
  return `patient:${patientId}`;
}

export function toothVersionKey(patientId: string, toothFdi: number): string {
  return `tooth:${patientId}:${toothFdi}`;
}

export function setEntityVersion(key: string, updatedAt: string | Date | null | undefined): void {
  if (!key || updatedAt == null) return;
  const iso = updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt);
  if (!iso) return;
  versions.set(key, iso);
}

export function getEntityVersion(key: string): string | undefined {
  return versions.get(key);
}

export function clearEntityVersions(): void {
  versions.clear();
}

export function rememberPatientVersion(patient: {
  id?: string;
  updatedAt?: string | Date | null;
}): void {
  if (!patient?.id || patient.updatedAt == null) return;
  setEntityVersion(patientVersionKey(patient.id), patient.updatedAt);
}

export function rememberToothVersion(tooth: {
  patientId?: string;
  toothFdi?: number;
  updatedAt?: string | Date | null;
}): void {
  if (!tooth?.patientId || tooth.toothFdi == null || tooth.updatedAt == null) return;
  setEntityVersion(toothVersionKey(tooth.patientId, tooth.toothFdi), tooth.updatedAt);
}

export function rememberPatients(patients: Array<{ id?: string; updatedAt?: string | Date | null }>): void {
  for (const p of patients) rememberPatientVersion(p);
}

export function rememberTeeth(
  patientId: string,
  teeth: Array<{ toothFdi?: number; updatedAt?: string | Date | null }>,
): void {
  for (const t of teeth) {
    rememberToothVersion({ patientId, toothFdi: t.toothFdi, updatedAt: t.updatedAt });
  }
}
