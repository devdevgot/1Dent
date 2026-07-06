CREATE TABLE IF NOT EXISTS "treatment_videos" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text REFERENCES "clinics"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "storage_key" text NOT NULL,
  "thumbnail_key" text,
  "duration_sec" integer,
  "related_conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "treatment_videos_clinic_id_idx" ON "treatment_videos" ("clinic_id");
CREATE INDEX IF NOT EXISTS "treatment_videos_category_idx" ON "treatment_videos" ("category");
