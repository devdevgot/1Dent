ALTER TABLE "clinics" ADD COLUMN "parent_clinic_id" text REFERENCES "clinics"("id") ON DELETE SET NULL;
