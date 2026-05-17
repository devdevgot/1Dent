-- Add system template support
ALTER TABLE "contract_templates" ADD COLUMN IF NOT EXISTS "is_system" boolean DEFAULT false NOT NULL;
ALTER TABLE "contract_templates" ADD COLUMN IF NOT EXISTS "system_type" text;

-- Add bundle token for grouping related contracts sent together
ALTER TABLE "patient_contracts" ADD COLUMN IF NOT EXISTS "bundle_token" text;
CREATE INDEX IF NOT EXISTS "idx_patient_contracts_bundle_token" ON "patient_contracts"("bundle_token");
