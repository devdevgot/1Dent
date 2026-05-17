import {
  db,
  contractTemplatesTable,
  patientContractsTable,
  patientsTable,
  usersTable,
  clinicsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { ContractTemplate, PatientContract, FieldMapping } from "@workspace/db";

export class ContractsRepository {
  // ── Templates ──────────────────────────────────────────────────────────────

  async listTemplates(clinicId: string): Promise<ContractTemplate[]> {
    return db
      .select()
      .from(contractTemplatesTable)
      .where(eq(contractTemplatesTable.clinicId, clinicId))
      .orderBy(desc(contractTemplatesTable.createdAt));
  }

  async findTemplate(id: string, clinicId: string): Promise<ContractTemplate | null> {
    const [row] = await db
      .select()
      .from(contractTemplatesTable)
      .where(and(eq(contractTemplatesTable.id, id), eq(contractTemplatesTable.clinicId, clinicId)))
      .limit(1);
    return row ?? null;
  }

  async createTemplate(data: {
    clinicId: string;
    name: string;
    fileUrl: string;
    fileType: string;
    extractedText: string;
    fieldMappings: FieldMapping[];
  }): Promise<ContractTemplate> {
    const [row] = await db
      .insert(contractTemplatesTable)
      .values({ id: randomUUID(), ...data })
      .returning();
    return row!;
  }

  async updateTemplateMappings(
    id: string,
    clinicId: string,
    fieldMappings: FieldMapping[],
  ): Promise<ContractTemplate | null> {
    const [row] = await db
      .update(contractTemplatesTable)
      .set({ fieldMappings, updatedAt: new Date() })
      .where(and(eq(contractTemplatesTable.id, id), eq(contractTemplatesTable.clinicId, clinicId)))
      .returning();
    return row ?? null;
  }

  async deleteTemplate(id: string, clinicId: string): Promise<boolean> {
    const result = await db
      .delete(contractTemplatesTable)
      .where(and(eq(contractTemplatesTable.id, id), eq(contractTemplatesTable.clinicId, clinicId)))
      .returning({ id: contractTemplatesTable.id });
    return result.length > 0;
  }

  // ── Patient contracts ──────────────────────────────────────────────────────

  async listPatientContracts(
    patientId: string,
    clinicId: string,
  ): Promise<
    (PatientContract & { templateName: string; sentByName: string | null })[]
  > {
    return db
      .select({
        id: patientContractsTable.id,
        clinicId: patientContractsTable.clinicId,
        patientId: patientContractsTable.patientId,
        templateId: patientContractsTable.templateId,
        sentById: patientContractsTable.sentById,
        token: patientContractsTable.token,
        renderedHtml: patientContractsTable.renderedHtml,
        filledData: patientContractsTable.filledData,
        status: patientContractsTable.status,
        signedAt: patientContractsTable.signedAt,
        signedIp: patientContractsTable.signedIp,
        createdAt: patientContractsTable.createdAt,
        templateName: contractTemplatesTable.name,
        sentByName: usersTable.name,
      })
      .from(patientContractsTable)
      .innerJoin(contractTemplatesTable, eq(patientContractsTable.templateId, contractTemplatesTable.id))
      .leftJoin(usersTable, eq(patientContractsTable.sentById, usersTable.id))
      .where(
        and(
          eq(patientContractsTable.patientId, patientId),
          eq(patientContractsTable.clinicId, clinicId),
        ),
      )
      .orderBy(desc(patientContractsTable.createdAt));
  }

  async createPatientContract(data: {
    clinicId: string;
    patientId: string;
    templateId: string;
    sentById: string | null;
    token: string;
    renderedHtml: string;
    filledData: Record<string, string>;
  }): Promise<PatientContract> {
    const [row] = await db
      .insert(patientContractsTable)
      .values({ id: randomUUID(), ...data, status: "sent" })
      .returning();
    return row!;
  }

  async findContractByToken(token: string): Promise<{
    contract: PatientContract;
    templateName: string;
    patientName: string;
    patientPhone: string;
    clinicName: string;
  } | null> {
    const [row] = await db
      .select({
        contract: patientContractsTable,
        templateName: contractTemplatesTable.name,
        patientName: patientsTable.name,
        patientPhone: patientsTable.phone,
        clinicName: clinicsTable.name,
      })
      .from(patientContractsTable)
      .innerJoin(contractTemplatesTable, eq(patientContractsTable.templateId, contractTemplatesTable.id))
      .innerJoin(patientsTable, eq(patientContractsTable.patientId, patientsTable.id))
      .innerJoin(clinicsTable, eq(patientContractsTable.clinicId, clinicsTable.id))
      .where(eq(patientContractsTable.token, token))
      .limit(1);

    return row ?? null;
  }

  async markContractViewed(token: string): Promise<void> {
    await db
      .update(patientContractsTable)
      .set({ status: "viewed" })
      .where(
        and(
          eq(patientContractsTable.token, token),
          eq(patientContractsTable.status, "sent"),
        ),
      );
  }

  async markContractSigned(
    token: string,
    ip: string | null,
  ): Promise<PatientContract | null> {
    const [row] = await db
      .update(patientContractsTable)
      .set({ status: "signed", signedAt: new Date(), signedIp: ip })
      .where(eq(patientContractsTable.token, token))
      .returning();
    return row ?? null;
  }
}
