ALTER TABLE "treatment_plans" ADD COLUMN IF NOT EXISTS "plan_number" integer NOT NULL DEFAULT 1;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY patient_id, clinic_id ORDER BY created_at ASC) AS rn
  FROM treatment_plans
)
UPDATE treatment_plans tp
SET plan_number = ranked.rn
FROM ranked
WHERE tp.id = ranked.id;
