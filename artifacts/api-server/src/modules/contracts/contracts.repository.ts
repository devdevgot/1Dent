import {
  db,
  contractTemplatesTable,
  patientContractsTable,
  patientsTable,
  usersTable,
  clinicsTable,
  treatmentPlansTable,
  treatmentPlanItemsTable,
} from "@workspace/db";
import { eq, and, desc, isNotNull, inArray, ne } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { ContractTemplate, PatientContract, FieldMapping } from "@workspace/db";
import {
  EXTRACTION_TEMPLATES,
  type ExtractionTemplateDefinition,
  getExtractionTemplateText,
  renderExtractionTemplate,
  textToHtml,
} from "./extraction-templates";
import { logger } from "../../lib/logger";

const SYSTEM_TEMPLATE_BATCH_SIZE = 20;

function systemTemplateText(tmpl: ContractTemplate): string {
  return tmpl.extractedText ?? getExtractionTemplateText(tmpl.systemType ?? "");
}

export function matchServiceToSubcategory(title: string): string[] {
  const lower = title.toLowerCase();
  const matched: string[] = [];

  // Детская терапия
  if (
    (lower.includes("детск") || lower.includes("ребен") || lower.includes("молочн") || lower.includes("дет.")) &&
    (lower.includes("терап") || lower.includes("лечен") || lower.includes("кариес") || lower.includes("пульп") || lower.includes("пломб") || lower.includes("десн") || lower.includes("парод"))
  ) {
    matched.push("Детская терапия");
  }

  // Детская хирургия
  if (
    (lower.includes("детск") || lower.includes("ребен") || lower.includes("молочн") || lower.includes("дет.")) &&
    (lower.includes("хирур") || lower.includes("удален") || lower.includes("экстрак"))
  ) {
    matched.push("Детская хирургия");
  }

  // Синуслифтинг
  if (lower.includes("синус") || lower.includes("sinus")) {
    matched.push("Синуслифтинг");
  }

  // Имплантация
  if (lower.includes("имплант") || lower.includes("implant")) {
    matched.push("Имплантация");
  }

  // Ортодонтия для детей
  if (
    (lower.includes("ортодонт") || lower.includes("брекет") || lower.includes("элайнер") || lower.includes("пластинк") || lower.includes("капп")) &&
    (lower.includes("детск") || lower.includes("ребен") || lower.includes("молочн") || lower.includes("дет."))
  ) {
    matched.push("Ортодонтия для детей");
  }

  // Ортодонтия для взрослых
  if (
    (lower.includes("ортодонт") || lower.includes("брекет") || lower.includes("элайнер") || lower.includes("капп")) &&
    !matched.includes("Ортодонтия для детей")
  ) {
    matched.push("Ортодонтия для взрослых");
  }

  // Виниры
  if (lower.includes("видир") || lower.includes("винир") || lower.includes("veneer")) {
    matched.push("Виниры");
  }

  // Съемные конструкции
  if (lower.includes("съемн") || lower.includes("бюгел") || (lower.includes("протез") && lower.includes("съем"))) {
    matched.push("Съемные констукций");
  }

  // Несъемные конструкции
  if (
    (lower.includes("коронка") || lower.includes("металлокерам") || lower.includes("циркон") || lower.includes("несъемн") || lower.includes("мостовид") || lower.includes("протез")) &&
    !matched.includes("Съемные констукций")
  ) {
    matched.push("Несъемные контрукций");
  }

  // Глубокий кариес
  if (lower.includes("глубок") && lower.includes("кариес")) {
    matched.push("Глубокий карис");
  }

  // Средний кариес
  if (
    (lower.includes("средн") && lower.includes("кариес")) ||
    (lower.includes("поверхн") && lower.includes("кариес")) ||
    lower.includes("пломб") ||
    ((lower.includes("кариес") || lower.includes("реставрац")) && !lower.includes("глубок"))
  ) {
    matched.push("Средний карис");
  }

  // Депульпирование зуба
  if (lower.includes("депульп")) {
    matched.push("Депульпирование зуба");
  }

  // Клиновидный дефект
  if (lower.includes("клиновид")) {
    matched.push("Клиновидный дефект");
  }

  // Лечение десен
  if (
    lower.includes("десен") ||
    lower.includes("пародонт") ||
    lower.includes("вектор") ||
    lower.includes("гигиен") ||
    lower.includes("чистк") ||
    (lower.includes("лечение") && lower.includes("дес"))
  ) {
    matched.push("Лечение десен");
  }

  // Периодонтит
  if (lower.includes("периодонтит") || lower.includes("периодонт")) {
    matched.push("Периодонтит");
  }

  // Пульпит
  if (lower.includes("пульпит")) {
    matched.push("Пулпит");
  }

  // Резекция верхушки корня
  if (lower.includes("резекц")) {
    matched.push("Резекция верхушки корня");
  }

  // Удаление зуба
  if ((lower.includes("удален") || lower.includes("экстрак")) && !matched.includes("Детская хирургия") && !lower.includes("молочн")) {
    matched.push("Удаление зуба");
  }

  // Операций
  if (
    (lower.includes("операц") || lower.includes("хирург") || lower.includes("пластика") || lower.includes("иссечен")) &&
    !matched.includes("Удаление зуба") &&
    !matched.includes("Резекция верхушки корня") &&
    !matched.includes("Детская хирургия")
  ) {
    matched.push("Операций");
  }

  return matched;
}


export class ContractsRepository {
  // ── Templates ──────────────────────────────────────────────────────────────

  async listTemplates(clinicId: string): Promise<ContractTemplate[]> {
    try {
      await this.ensureSystemExtractionTemplates(clinicId);
    } catch (err) {
      logger.error(
        { err, clinicId },
        "[contracts] ensureSystemExtractionTemplates failed during list — returning partial catalog",
      );
    }

    const rows = await db
      .select()
      .from(contractTemplatesTable)
      .where(eq(contractTemplatesTable.clinicId, clinicId));

    const userTemplates = rows
      .filter((t) => !t.isSystem)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const systemByType = new Map(
      rows
        .filter((t) => t.isSystem && t.systemType)
        .map((t) => [t.systemType!, t] as const),
    );

    for (const def of EXTRACTION_TEMPLATES) {
      if (systemByType.has(def.id)) continue;
      try {
        const row = await this.insertSystemTemplate(clinicId, def);
        systemByType.set(def.id, row);
      } catch (err) {
        logger.error(
          { err, clinicId, systemType: def.id },
          "[contracts] failed to insert missing built-in template",
        );
      }
    }

    const systemTemplates = EXTRACTION_TEMPLATES.map((def) => systemByType.get(def.id)).filter(
      Boolean,
    ) as ContractTemplate[];

    return [...systemTemplates, ...userTemplates];
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

  private async insertSystemTemplate(
    clinicId: string,
    def: ExtractionTemplateDefinition,
  ): Promise<ContractTemplate> {
    const [row] = await db
      .insert(contractTemplatesTable)
      .values({
        id: randomUUID(),
        clinicId,
        name: def.name,
        fileUrl: "__system__",
        fileType: "html",
        extractedText: null,
        fieldMappings: [] as unknown as FieldMapping[],
        isSystem: true,
        systemType: def.id,
      })
      .returning();
    return row!;
  }

  /**
   * Creates built-in system templates for a clinic if missing.
   * Returns all templates in catalog definition order.
   */
  async ensureSystemExtractionTemplates(clinicId: string): Promise<ContractTemplate[]> {
    const activeSystemIds = new Set(EXTRACTION_TEMPLATES.map((def) => def.id));

    let existing = await db
      .select()
      .from(contractTemplatesTable)
      .where(
        and(
          eq(contractTemplatesTable.clinicId, clinicId),
          inArray(contractTemplatesTable.systemType, [...activeSystemIds]),
        ),
      );

    // Mark legacy rows that have systemType but isSystem=false
    const legacyIds = existing.filter((t) => !t.isSystem).map((t) => t.id);
    if (legacyIds.length > 0) {
      await db
        .update(contractTemplatesTable)
        .set({ isSystem: true, updatedAt: new Date() })
        .where(
          and(
            eq(contractTemplatesTable.clinicId, clinicId),
            inArray(contractTemplatesTable.id, legacyIds),
          ),
        );
      existing = existing.map((t) => (legacyIds.includes(t.id) ? { ...t, isSystem: true } : t));
    }

    const obsolete = existing.filter((t) => t.systemType && !activeSystemIds.has(t.systemType));
    if (obsolete.length > 0) {
      const obsoleteIds = obsolete.map((o) => o.id);
      await db.delete(contractTemplatesTable).where(
        and(
          eq(contractTemplatesTable.clinicId, clinicId),
          inArray(contractTemplatesTable.id, obsoleteIds),
        ),
      );
      existing = existing.filter((t) => !obsoleteIds.includes(t.id));
    }

    const existingTypes = new Set(
      existing.map((t) => t.systemType).filter((type): type is string => Boolean(type)),
    );
    const toCreate = EXTRACTION_TEMPLATES.filter((def) => !existingTypes.has(def.id));

    if (toCreate.length > 0) {
      for (let i = 0; i < toCreate.length; i += SYSTEM_TEMPLATE_BATCH_SIZE) {
        const batch = toCreate.slice(i, i + SYSTEM_TEMPLATE_BATCH_SIZE);
        try {
          const inserted = await db
            .insert(contractTemplatesTable)
            .values(
              batch.map((def) => ({
                id: randomUUID(),
                clinicId,
                name: def.name,
                fileUrl: "__system__",
                fileType: "html",
                extractedText: null,
                fieldMappings: [] as unknown as FieldMapping[],
                isSystem: true,
                systemType: def.id,
              })),
            )
            .returning();
          existing.push(...inserted);
        } catch (err) {
          logger.warn(
            { err, clinicId, batchStart: i, batchSize: batch.length },
            "[contracts] batch insert failed — retrying one-by-one",
          );
          for (const def of batch) {
            if (existingTypes.has(def.id)) continue;
            try {
              const row = await this.insertSystemTemplate(clinicId, def);
              existing.push(row);
              existingTypes.add(def.id);
            } catch (singleErr) {
              logger.error(
                { err: singleErr, clinicId, systemType: def.id },
                "[contracts] failed to insert built-in template",
              );
            }
          }
        }
      }
    }

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
      .orderBy(desc(patientContractsTable.createdAt)) as any;
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
    clinicPhone: string;
    doctorName: string;
    date: string;
    year: string;
    serviceNames?: string[];
  }): Promise<{ bundleToken: string; contracts: PatientContract[]; matchedSubcategories: string[] }> {
    const allTemplates = await this.ensureSystemExtractionTemplates(data.clinicId);

    // 1. Identify relevant subcategories
    const matchedSubcategories = new Set<string>();
    
    // Check passed service names
    if (data.serviceNames && data.serviceNames.length > 0) {
      for (const name of data.serviceNames) {
        matchServiceToSubcategory(name).forEach(sc => matchedSubcategories.add(sc));
      }
    }
    
    // Check active plan items
    const activePlan = await db
      .select({ id: treatmentPlansTable.id })
      .from(treatmentPlansTable)
      .where(
        and(
          eq(treatmentPlansTable.patientId, data.patientId),
          eq(treatmentPlansTable.clinicId, data.clinicId),
          ne(treatmentPlansTable.status, "completed"),
          ne(treatmentPlansTable.status, "cancelled")
        )
      )
      .orderBy(desc(treatmentPlansTable.createdAt))
      .limit(1);

    if (activePlan.length > 0) {
      const items = await db
        .select({ title: treatmentPlanItemsTable.title })
        .from(treatmentPlanItemsTable)
        .where(eq(treatmentPlanItemsTable.planId, activePlan[0]!.id));
      
      items.forEach((it) => {
        matchServiceToSubcategory(it.title).forEach(sc => matchedSubcategories.add(sc));
      });
    }

    // Default fallback: if no subcategories matched, default to "Удаление зуба" templates
    if (matchedSubcategories.size === 0) {
      matchedSubcategories.add("Удаление зуба");
    }

    // 2. Filter templates matching the matched subcategories
    const templates = allTemplates.filter((tmpl) => {
      const def = EXTRACTION_TEMPLATES.find((d) => d.id === tmpl.systemType);
      return def && def.subcategory && matchedSubcategories.has(def.subcategory);
    });

    const vars: Record<string, string> = {
      patient_name: data.patientName,
      clinic_name: data.clinicName,
      clinic_phone: data.clinicPhone,
      doctor_name: data.doctorName,
      date: data.date,
      year: data.year,
      iin: data.patientIin,
      dob: data.patientDob,
      phone: data.patientPhone,
    };

    const bundleToken = randomUUID();

    if (templates.length === 0) {
      return { bundleToken: "", contracts: [], matchedSubcategories: [...matchedSubcategories] };
    }

    const rows = await db
      .insert(patientContractsTable)
      .values(
        templates.map((tmpl) => {
          const rendered = textToHtml(renderExtractionTemplate(systemTemplateText(tmpl), vars));
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

    return { bundleToken, contracts: rows, matchedSubcategories: [...matchedSubcategories] };
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
      systemType: string | null;
      patientName: string;
      patientPhone: string;
      clinicName: string;
    }>
  > {
    return db
      .select({
        contract: patientContractsTable,
        templateName: contractTemplatesTable.name,
        systemType: contractTemplatesTable.systemType,
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
