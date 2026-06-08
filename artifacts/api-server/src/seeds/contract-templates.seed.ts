import { db, clinicsTable } from "@workspace/db";
import { ContractsRepository } from "../modules/contracts/contracts.repository";
import { logger } from "../lib/logger";

const repo = new ContractsRepository();

/** Ensures built-in contract template bundles exist for every clinic. */
export async function seedAllClinicsContractTemplates(): Promise<void> {
  const clinics = await db.select({ id: clinicsTable.id }).from(clinicsTable);
  if (clinics.length === 0) return;

  let seeded = 0;
  for (const clinic of clinics) {
    try {
      await repo.ensureSystemExtractionTemplates(clinic.id);
      seeded++;
    } catch (err) {
      logger.error({ err, clinicId: clinic.id }, "[contract-templates.seed] Failed for clinic");
    }
  }

  logger.info(
    { clinics: clinics.length, seeded },
    "[contract-templates.seed] Built-in contract templates ensured",
  );
}
