-- Backfill patients.doctor_id from the most recent non-cancelled procedure
-- when the treating physician was never persisted on the patient row.
UPDATE patients AS p
SET
  doctor_id = sub.doctor_id,
  updated_at = NOW()
FROM (
  SELECT DISTINCT ON (patient_id)
    patient_id,
    doctor_id
  FROM procedures
  WHERE doctor_id IS NOT NULL
    AND status IS DISTINCT FROM 'cancelled'
  ORDER BY
    patient_id,
    COALESCE(scheduled_at, created_at) DESC NULLS LAST,
    created_at DESC
) AS sub
WHERE p.id = sub.patient_id
  AND p.doctor_id IS NULL;
