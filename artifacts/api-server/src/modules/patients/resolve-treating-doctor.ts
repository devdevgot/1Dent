import { pool } from "@workspace/db";

/**
 * Latest non-cancelled procedure doctor per patient.
 * Used when patients.doctor_id was never persisted but schedules already have a doctor.
 */
export async function latestProcedureDoctorMap(
  clinicId: string,
  patientIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(patientIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { rows } = await pool.query<{ patient_id: string; doctor_id: string }>(
    `SELECT DISTINCT ON (patient_id)
       patient_id,
       doctor_id
     FROM procedures
     WHERE clinic_id = $1
       AND patient_id = ANY($2::text[])
       AND doctor_id IS NOT NULL
       AND status IS DISTINCT FROM 'cancelled'
     ORDER BY
       patient_id,
       COALESCE(scheduled_at, created_at) DESC NULLS LAST,
       created_at DESC`,
    [clinicId, unique],
  );

  return new Map(rows.map((r) => [r.patient_id, r.doctor_id]));
}
