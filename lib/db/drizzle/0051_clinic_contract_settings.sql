ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "contract_legal_name" text;
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "contract_city" text;
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "contract_address" text;
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "contract_license" text;
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "contract_director" text;
