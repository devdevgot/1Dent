import { db, clinicsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const contractSettingsColumns = {
  contractLegalName: clinicsTable.contractLegalName,
  contractCity: clinicsTable.contractCity,
  contractAddress: clinicsTable.contractAddress,
  contractLicense: clinicsTable.contractLicense,
  contractDirector: clinicsTable.contractDirector,
} as const;

export type ClinicContractSettings = {
  contractLegalName: string | null;
  contractCity: string | null;
  contractAddress: string | null;
  contractLicense: string | null;
  contractDirector: string | null;
};

const emptySettings = (): ClinicContractSettings => ({
  contractLegalName: null,
  contractCity: null,
  contractAddress: null,
  contractLicense: null,
  contractDirector: null,
});

export class ClinicContractSettingsRepository {
  async getContractSettings(clinicId: string): Promise<ClinicContractSettings> {
    const [row] = await db
      .select(contractSettingsColumns)
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);
    return row ?? emptySettings();
  }

  async updateContractSettings(
    clinicId: string,
    data: Partial<ClinicContractSettings>,
  ): Promise<ClinicContractSettings> {
    const updates = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(updates).length === 0) {
      return this.getContractSettings(clinicId);
    }
    const [row] = await db
      .update(clinicsTable)
      .set(updates)
      .where(eq(clinicsTable.id, clinicId))
      .returning(contractSettingsColumns);
    return row ?? emptySettings();
  }
}
