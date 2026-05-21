ALTER TABLE "tooth_records" ADD COLUMN IF NOT EXISTS "ai_analysis" text;
ALTER TABLE "tooth_records" ADD COLUMN IF NOT EXISTS "ai_analysis_condition" text;
ALTER TABLE "tooth_records" ADD COLUMN IF NOT EXISTS "ai_analysis_plan_title" text;
