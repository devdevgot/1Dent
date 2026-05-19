import {
  db,
  contractTemplatesTable,
  patientContractsTable,
  patientsTable,
  usersTable,
  clinicsTable,
} from "@workspace/db";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { ContractTemplate, PatientContract, FieldMapping } from "@workspace/db";
import {
  EXTRACTION_TEMPLATES,
  renderExtractionTemplate,
  textToHtml,
} from "./extraction-templates";

export class ContractsRepository {
  // ── Templates ──────────────────────────────────────────────────────────────

  async listTemplates(clinicId: string): Promise<ContractTemplate[]> {
    // Ensure system (extraction) templates exist for this clinic on every list call
    await this.ensureSystemExtractionTemplates(clinicId);

    return db
      .select()
      .from(contractTemplatesTable)
      .where(eq(contractTemplatesTable.clinicId, clinicId))
      .orderBy(contractTemplatesTable.isSystem, desc(contractTemplatesTable.createdAt));
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

  // ── System (extraction) templates ──────────────────────────────────────────

  /**
   * Lazily creates the 4 extraction system templates for a clinic if they
   * don't already exist, then returns all 4 in definition order.
   */
  async ensureSystemExtractionTemplates(clinicId: string): Promise<ContractTemplate[]> {
    const existing = await db
      .select()
      .from(contractTemplatesTable)
      .where(and(eq(contractTemplatesTable.clinicId, clinicId), eq(contractTemplatesTable.isSystem, true)));

    const existingTypes = new Set(existing.map((t) => t.systemType));

    const toCreate = EXTRACTION_TEMPLATES.filter((def) => !existingTypes.has(def.id));

    if (toCreate.length > 0) {
      const inserted = await db
        .insert(contractTemplatesTable)
        .values(
          toCreate.map((def) => ({
            id: randomUUID(),
            clinicId,
            name: def.name,
            fileUrl: "__system__",
            fileType: "html",
            extractedText: def.text,
            fieldMappings: [] as unknown as FieldMapping[],
            isSystem: true,
            systemType: def.id,
          })),
        )
        .returning();
      existing.push(...inserted);
    }

    // Return in definition order
    return EXTRACTION_TEMPLATES.map(
      (def) => existing.find((t) => t.systemType === def.id)!,
    ).filter(Boolean);
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
        bundleToken: patientContractsTable.bundleToken,
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

  /**
   * Creates all 4 extraction contracts sharing the same bundleToken.
   * Fills each template with patient/clinic data and renders HTML.
   */
  async createExtractionBundle(data: {
    clinicId: string;
    patientId: string;
    sentById: string | null;
    patientName: string;
    patientPhone: string;
    patientIin: string;
    patientDob: string;
    clinicName: string;
    doctorName: string;
    date: string;
    year: string;
  }): Promise<{ bundleToken: string; contracts: PatientContract[] }> {
    const templates = await this.ensureSystemExtractionTemplates(data.clinicId);

    const vars: Record<string, string> = {
      patient_name: data.patientName,
      clinic_name: data.clinicName,
      doctor_name: data.doctorName,
      date: data.date,
      year: data.year,
      iin: data.patientIin,
      dob: data.patientDob,
      phone: data.patientPhone,
    };

    const bundleToken = randomUUID();

    const rows = await db
      .insert(patientContractsTable)
      .values(
        templates.map((tmpl) => {
          const rendered = textToHtml(renderExtractionTemplate(tmpl.extractedText ?? "", vars));
          return {
            id: randomUUID(),
            clinicId: data.clinicId,
            patientId: data.patientId,
            templateId: tmpl.id,
            sentById: data.sentById,
            token: randomUUID(),
            bundleToken,
            renderedHtml: rendered,
            filledData: vars as unknown as Record<string, string>,
            status: "created" as const,
          };
        }),
      )
      .returning();

    return { bundleToken, contracts: rows };
  }

  async markBundleSent(bundleToken: string): Promise<void> {
    await db
      .update(patientContractsTable)
      .set({ status: "sent" })
      .where(
        and(
          eq(patientContractsTable.bundleToken, bundleToken),
          eq(patientContractsTable.status, "created"),
        ),
      );
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

  async findContractsByBundleToken(bundleToken: string): Promise<
    Array<{
      contract: PatientContract;
      templateName: string;
      patientName: string;
      patientPhone: string;
      clinicName: string;
    }>
  > {
    return db
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
      .where(eq(patientContractsTable.bundleToken, bundleToken))
      .orderBy(patientContractsTable.createdAt);
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

  async markBundleViewed(bundleToken: string): Promise<void> {
    await db
      .update(patientContractsTable)
      .set({ status: "viewed" })
      .where(
        and(
          eq(patientContractsTable.bundleToken, bundleToken),
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

  async markBundleSigned(
    bundleToken: string,
    ip: string | null,
  ): Promise<PatientContract[]> {
    return db
      .update(patientContractsTable)
      .set({ status: "signed", signedAt: new Date(), signedIp: ip })
      .where(eq(patientContractsTable.bundleToken, bundleToken))
      .returning();
  }

  // ── OTP helpers ────────────────────────────────────────────────────────────

  /** Saves a 6-digit OTP for a single contract token (expires in 5 min). */
  async saveOtpForToken(token: string, code: string, expiresAt: Date): Promise<void> {
    await db
      .update(patientContractsTable)
      .set({ otpCode: code, otpExpiresAt: expiresAt })
      .where(eq(patientContractsTable.token, token));
  }

  /** Saves the same OTP for all contracts in a bundle (expires in 5 min). */
  async saveOtpForBundle(bundleToken: string, code: string, expiresAt: Date): Promise<void> {
    await db
      .update(patientContractsTable)
      .set({ otpCode: code, otpExpiresAt: expiresAt })
      .where(eq(patientContractsTable.bundleToken, bundleToken));
  }

  /**
   * Verifies OTP for a single contract.
   * Returns 'ok' | 'invalid' | 'expired' | 'not_found'.
   */
  async verifyOtpForToken(token: string, code: string): Promise<"ok" | "invalid" | "expired" | "not_found"> {
    const [row] = await db
      .select({ otpCode: patientContractsTable.otpCode, otpExpiresAt: patientContractsTable.otpExpiresAt })
      .from(patientContractsTable)
      .where(eq(patientContractsTable.token, token))
      .limit(1);
    if (!row) return "not_found";
    if (!row.otpCode) return "invalid";
    if (row.otpExpiresAt && new Date() > row.otpExpiresAt) return "expired";
    if (row.otpCode !== code) return "invalid";
    return "ok";
  }

  /**
   * Verifies OTP for a bundle (checks the first contract's OTP).
   * Returns 'ok' | 'invalid' | 'expired' | 'not_found'.
   */
  async verifyOtpForBundle(bundleToken: string, code: string): Promise<"ok" | "invalid" | "expired" | "not_found"> {
    const [row] = await db
      .select({ otpCode: patientContractsTable.otpCode, otpExpiresAt: patientContractsTable.otpExpiresAt })
      .from(patientContractsTable)
      .where(eq(patientContractsTable.bundleToken, bundleToken))
      .limit(1);
    if (!row) return "not_found";
    if (!row.otpCode) return "invalid";
    if (row.otpExpiresAt && new Date() > row.otpExpiresAt) return "expired";
    if (row.otpCode !== code) return "invalid";
    return "ok";
  }
}
