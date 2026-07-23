import { randomUUID } from "crypto";
import type { ToothCondition } from "@workspace/db";
import { DentalRepository } from "./dental.repository";
import { ProceduresRepository } from "../procedures/procedures.repository";
import { InventoryRepository } from "../inventory/inventory.repository";
import { TreatmentPlansRepository } from "../treatment-plans/treatment-plans.repository";
import { scheduleDentalAiAnalysis } from "./dental-ai";
import { logger } from "../../lib/logger";
import type { VoiceApplyBody, VoiceApplyError, VoiceApplyResult } from "./voice-diagnose-apply.schema";

export {
  voiceApplyBodySchema,
  VOICE_APPLY_MAX_ENTRIES,
  type VoiceApplyBody,
  type VoiceApplyError,
  type VoiceApplyResult,
} from "./voice-diagnose-apply.schema";

type ApplyCtx = {
  clinicId: string;
  patientId: string;
  userId: string;
  doctorId?: string;
};

function parseTemplateMaterials(
  raw: string | null | undefined,
): { name: string; quantity: number; unit?: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw)) as { name: string; quantity: number; unit?: string }[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function applyVoiceDiagnoses(
  body: VoiceApplyBody,
  ctx: ApplyCtx,
  deps?: {
    dental?: DentalRepository;
    procedures?: ProceduresRepository;
    inventory?: InventoryRepository;
    plans?: TreatmentPlansRepository;
  },
): Promise<VoiceApplyResult> {
  const dental = deps?.dental ?? new DentalRepository();
  const procedures = deps?.procedures ?? new ProceduresRepository();
  const inventory = deps?.inventory ?? new InventoryRepository();
  const plans = deps?.plans ?? new TreatmentPlansRepository();

  const errors: VoiceApplyError[] = [];
  const appliedFdis: number[] = [];
  let appliedTeeth = 0;
  let appliedServices = 0;

  // Deduplicate by FDI — last entry wins (same tooth mentioned twice in review).
  const byFdi = new Map<number, VoiceApplyBody["entries"][number]>();
  for (const entry of body.entries) {
    byFdi.set(entry.fdi, entry);
  }
  const uniqueEntries = [...byFdi.values()];

  const existingTeeth = await dental.listTeeth(ctx.patientId, ctx.clinicId);
  const existingByFdi = new Map(existingTeeth.map((t) => [t.toothFdi, t]));

  for (const entry of uniqueEntries) {
    try {
      await dental.upsertTooth({
        id: existingByFdi.get(entry.fdi)?.id ?? randomUUID(),
        clinicId: ctx.clinicId,
        patientId: ctx.patientId,
        toothFdi: entry.fdi,
        condition: entry.condition as ToothCondition,
        notes: entry.notes ?? null,
        updatedBy: ctx.userId,
        updatedAt: new Date(),
      });
      appliedTeeth += 1;
      appliedFdis.push(entry.fdi);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save tooth";
      errors.push({ fdi: entry.fdi, kind: "tooth", message });
      logger.warn({ err, fdi: entry.fdi, patientId: ctx.patientId }, "[VoiceDiagnose] Bulk tooth upsert failed");
    }
  }

  const entryByFdi = new Map(uniqueEntries.map((e) => [e.fdi, e]));
  const uniqueTemplateIds = [...new Set(body.services.map((s) => s.templateId))];
  const templates = await Promise.all(
    uniqueTemplateIds.map((id) => procedures.findTemplateById(id, ctx.clinicId)),
  );
  const templateById = new Map(
    templates.filter((t): t is NonNullable<typeof t> => Boolean(t)).map((t) => [t.id, t]),
  );

  let planSortOrder = 0;
  let planReady = false;
  if (body.activePlanId) {
    try {
      const plan = await plans.getActivePlan(ctx.patientId, ctx.clinicId);
      if (plan && plan.id === body.activePlanId) {
        planReady = true;
        planSortOrder = plan.items.length;
      }
    } catch (err) {
      logger.warn({ err, patientId: ctx.patientId }, "[VoiceDiagnose] Could not load active plan for bulk apply");
    }
  }

  for (const service of body.services) {
    const template = templateById.get(service.templateId);
    if (!template) {
      errors.push({
        fdi: service.fdi,
        kind: "service",
        message: "Procedure template not found",
      });
      continue;
    }

    const name = `[Зуб ${service.fdi}] ${template.name}`;
    const price = Number(template.defaultPrice) || 0;
    const procedureId = randomUUID();

    try {
      const rawMaterials = parseTemplateMaterials(template.materials);
      let materialRefs: { itemId: string; quantity: number }[] = [];
      if (rawMaterials.length > 0) {
        const inventoryMatches = await procedures
          .findInventoryItemsByNames(rawMaterials.map((m) => m.name), ctx.clinicId)
          .catch(() => []);
        const nameToId = new Map(inventoryMatches.map((item) => [item.name.toLowerCase(), item.id]));
        materialRefs = rawMaterials
          .map((m) => ({ itemId: nameToId.get(m.name.toLowerCase()) ?? "", quantity: m.quantity }))
          .filter((m) => m.itemId !== "");
        if (materialRefs.length > 0) {
          await inventory.validateMaterials(ctx.clinicId, materialRefs);
        }
      }

      await procedures.create({
        id: procedureId,
        clinicId: ctx.clinicId,
        patientId: ctx.patientId,
        doctorId: ctx.doctorId,
        name,
        price,
      });

      if (materialRefs.length > 0) {
        try {
          await inventory.deductMaterials(ctx.clinicId, materialRefs);
          try {
            await procedures.saveProcedureMaterials(procedureId, materialRefs);
          } catch (saveErr) {
            await inventory.restoreStock(ctx.clinicId, materialRefs).catch(() => {});
            await procedures.delete(procedureId, ctx.clinicId).catch(() => {});
            throw saveErr;
          }
        } catch (stockErr) {
          await procedures.delete(procedureId, ctx.clinicId).catch(() => {});
          throw stockErr;
        }
      }

      appliedServices += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create procedure";
      errors.push({ fdi: service.fdi, kind: "service", message });
      logger.warn(
        { err, fdi: service.fdi, templateId: service.templateId, patientId: ctx.patientId },
        "[VoiceDiagnose] Bulk service create failed",
      );
      continue;
    }

    if (planReady && body.activePlanId) {
      const entry = entryByFdi.get(service.fdi);
      try {
        await plans.addItem(
          body.activePlanId,
          ctx.clinicId,
          ctx.patientId,
          {
            toothFdi: service.fdi,
            condition: entry?.condition,
            mkb10Code: entry?.mkb10Code,
            title: name,
            price,
          },
          planSortOrder,
        );
        planSortOrder += 1;
      } catch (err) {
        // Non-critical: plan might be locked or already have this item
        const message = err instanceof Error ? err.message : "Failed to add plan item";
        errors.push({ fdi: service.fdi, kind: "planItem", message });
        logger.warn(
          { err, fdi: service.fdi, planId: body.activePlanId },
          "[VoiceDiagnose] Bulk plan item add failed",
        );
      }
    }
  }

  scheduleDentalAiAnalysis(ctx.clinicId, ctx.patientId);

  return { appliedTeeth, appliedServices, appliedFdis, errors };
}
