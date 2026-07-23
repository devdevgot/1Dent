ALTER TYPE "tablet_video_section" ADD VALUE IF NOT EXISTS 'periodontitis';
ALTER TYPE "tablet_video_section" ADD VALUE IF NOT EXISTS 'braces';
ALTER TYPE "tablet_video_section" ADD VALUE IF NOT EXISTS 'aligners';
ALTER TYPE "tablet_video_section" ADD VALUE IF NOT EXISTS 'restoration';

ALTER TABLE "tablet_videos" ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'other';

UPDATE "tablet_videos"
SET "category" = CASE "section"::text
  WHEN 'cavity' THEN 'therapy'
  WHEN 'root_canal' THEN 'therapy'
  WHEN 'treated' THEN 'therapy'
  WHEN 'periodontitis' THEN 'therapy'
  WHEN 'hygiene' THEN 'hygiene'
  WHEN 'crown' THEN 'orthopedics'
  WHEN 'implant' THEN 'implantation'
  WHEN 'extraction_needed' THEN 'surgery'
  WHEN 'braces' THEN 'orthodontics'
  WHEN 'aligners' THEN 'orthodontics'
  WHEN 'restoration' THEN 'restoration'
  WHEN 'general' THEN 'other'
  ELSE 'other'
END;

CREATE INDEX IF NOT EXISTS "tablet_videos_category_idx" ON "tablet_videos" ("category");
