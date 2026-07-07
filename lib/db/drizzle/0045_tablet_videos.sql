DO $$ BEGIN
  CREATE TYPE "tablet_video_section" AS ENUM(
    'cavity',
    'root_canal',
    'hygiene',
    'crown',
    'implant',
    'extraction_needed',
    'treated',
    'general'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "tablet_videos" (
  "id" text PRIMARY KEY NOT NULL,
  "section" "tablet_video_section" NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "storage_key" text NOT NULL,
  "mime_type" text DEFAULT 'video/mp4' NOT NULL,
  "duration_sec" integer,
  "file_size" integer,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tablet_videos_section_idx" ON "tablet_videos" ("section");
CREATE INDEX IF NOT EXISTS "tablet_videos_active_sort_idx" ON "tablet_videos" ("is_active", "sort_order");
