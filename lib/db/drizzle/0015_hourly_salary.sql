DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'salary_type') THEN
    ALTER TYPE "salary_type" ADD VALUE IF NOT EXISTS 'hourly';
  END IF;
END $$;
