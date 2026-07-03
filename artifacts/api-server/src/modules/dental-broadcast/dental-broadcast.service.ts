import { randomUUID } from "crypto";
import {
  db,
  dentalBroadcastRunsTable,
  dentalBroadcastDeliveriesTable,
  messagesTable,
  patientsTable,
  clinicsTable,
  chatbotSettingsTable,
  toothRecordsTable,
  treatmentPlansTable,
  treatmentPlanItemsTable,
} from "@workspace/db";
import { eq, and, isNotNull, ne, sql, inArray, asc } from "drizzle-orm";
import { sendToPatient } from "../../shared/messaging";
import { logger } from "../../lib/logger";
import { generateBroadcastMessageAi } from "./dental-broadcast-ai";

// Conditions that still require active treatment
const PROBLEM_CONDITIONS = [
  "cavity",
  "root_canal",
  "extraction_needed",
  "crown",
] as const;

const CONDITION_LABEL: Record<string, string> = {
  cavity: "кариес",
  root_canal: "требует эндодонтического лечения",
  extraction_needed: "требует удаления",
  crown: "требует коронки",
};

const DEDUP_DAYS = 14;
const MAX_TOOTH_LINES = 4;

const PROCEDURE_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bэндо\b/gi, "лечение каналов"],
  [/\bимп\b/gi, "имплантация"],
  [/\bудал\.?\b/gi, "удаление"],
  [/\bкоронк\w*/gi, "установка коронки"],
  [/\bпломб\w*/gi, "пломбирование"],
  [/\bдепульп\w*/gi, "лечение каналов"],
  [/\bпульпит\w*/gi, "лечение пульпита"],
  [/\bпериодонтит\w*/gi, "лечение периодонтита"],
  [/\bкариес\w*/gi, "лечение кариеса"],
  [/\bреставрац\w*/gi, "реставрация"],
  [/\bортоп\w*/gi, "ортопедическое лечение"],
  [/\bпротез\w*/gi, "протезирование"],
  [/\bчистк\w*/gi, "профессиональная чистка"],
  [/\bгигиен\w*/gi, "гигиена полости рта"],
];

type PatientForBroadcast = {
  id: string;
  name: string;
  phone: string;
  status: string;
  updatedAt: Date;
};

type ToothProblem = {
  toothFdi: number;
  label: string;
};

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeProcedureLabel(title: string): string {
  let label = title.trim();
  if (!label) return "Лечение";

  for (const [pattern, replacement] of PROCEDURE_ABBREVIATIONS) {
    label = label.replace(pattern, replacement);
  }

  label = label.replace(/\s+/g, " ").trim();
  if (label.length === 0) return "Лечение";

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function wasRecentlyBroadcast(patient: PatientForBroadcast): boolean {
  if (patient.status !== "repeat_sale") return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DEDUP_DAYS);
  return patient.updatedAt >= cutoff;
}

function formatRemainingTeethCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} зуб`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} зуба`;
  }
  return `${count} зубов`;
}

async function fetchPatientsForBroadcast(
  clinicId: string,
): Promise<PatientForBroadcast[]> {
  const rows = await db
    .selectDistinct({
      id: patientsTable.id,
      name: patientsTable.name,
      phone: patientsTable.phone,
      status: patientsTable.status,
      updatedAt: patientsTable.updatedAt,
    })
    .from(toothRecordsTable)
    .innerJoin(patientsTable, eq(patientsTable.id, toothRecordsTable.patientId))
    .where(
      and(
        eq(toothRecordsTable.clinicId, clinicId),
        inArray(toothRecordsTable.condition, [...PROBLEM_CONDITIONS]),
        isNotNull(patientsTable.phone),
        ne(patientsTable.phone, ""),
      ),
    );

  return rows.filter((r) => r.phone !== null) as PatientForBroadcast[];
}

async function countPatientsForBroadcast(clinicId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${patientsTable.id})::int` })
    .from(toothRecordsTable)
    .innerJoin(patientsTable, eq(patientsTable.id, toothRecordsTable.patientId))
    .where(
      and(
        eq(toothRecordsTable.clinicId, clinicId),
        inArray(toothRecordsTable.condition, [...PROBLEM_CONDITIONS]),
        isNotNull(patientsTable.phone),
        ne(patientsTable.phone, ""),
      ),
    );
  return row?.count ?? 0;
}

async function getPatientProblems(
  clinicId: string,
  patientId: string,
): Promise<ToothProblem[]> {
  // Prefer pending treatment plan items — they have specific procedure titles
  const activePlans = await db
    .select({ id: treatmentPlansTable.id })
    .from(treatmentPlansTable)
    .where(
      and(
        eq(treatmentPlansTable.clinicId, clinicId),
        eq(treatmentPlansTable.patientId, patientId),
        inArray(treatmentPlansTable.status, ["draft", "approved", "in_progress"]),
      ),
    )
    .limit(3);

  if (activePlans.length > 0) {
    const planIds = activePlans.map((p) => p.id);
    const items = await db
      .select({
        toothFdi: treatmentPlanItemsTable.toothFdi,
        title: treatmentPlanItemsTable.title,
      })
      .from(treatmentPlanItemsTable)
      .where(
        and(
          inArray(treatmentPlanItemsTable.planId, planIds),
          eq(treatmentPlanItemsTable.status, "pending"),
          isNotNull(treatmentPlanItemsTable.toothFdi),
        ),
      )
      .orderBy(asc(treatmentPlanItemsTable.sortOrder))
      .limit(8);

    const problems: ToothProblem[] = [];
    const seen = new Set<number>();
    for (const item of items) {
      if (item.toothFdi !== null && !seen.has(item.toothFdi)) {
        seen.add(item.toothFdi);
        problems.push({
          toothFdi: item.toothFdi,
          label: sanitizeProcedureLabel(item.title),
        });
      }
    }
    if (problems.length > 0) return problems;
  }

  // Fallback: raw tooth records with problem conditions
  const teeth = await db
    .select({
      toothFdi: toothRecordsTable.toothFdi,
      condition: toothRecordsTable.condition,
    })
    .from(toothRecordsTable)
    .where(
      and(
        eq(toothRecordsTable.clinicId, clinicId),
        eq(toothRecordsTable.patientId, patientId),
        inArray(toothRecordsTable.condition, [...PROBLEM_CONDITIONS]),
      ),
    )
    .orderBy(asc(toothRecordsTable.toothFdi));

  return teeth.map((t) => ({
    toothFdi: t.toothFdi,
    label: CONDITION_LABEL[t.condition] ?? t.condition,
  }));
}

/**
 * Returns a condition-specific urgency sentence based on what problems the patient has.
 * Priority: extraction > root canal / pulpitis > crown > caries > generic
 */
function getUrgencyMessage(problems: ToothProblem[]): string {
  if (problems.length > 1) {
    return (
      "Чем раньше продолжим лечение, тем проще восстановить здоровье зубов. " +
      "При откладывании визита процедуры обычно становятся сложнее и дороже 😔"
    );
  }

  const text = problems.map((p) => p.label.toLowerCase()).join(" ");

  const hasExtraction =
    text.includes("удал") ||
    text.includes("extraction") ||
    text.includes("extraction_needed");

  const hasRootCanal =
    text.includes("пульпит") ||
    text.includes("эндодонт") ||
    text.includes("канал") ||
    text.includes("root_canal") ||
    text.includes("периодонт");

  const hasCrown =
    text.includes("коронк") ||
    text.includes("crown");

  const hasCaries =
    text.includes("кариес") ||
    text.includes("пломб") ||
    text.includes("cavity") ||
    text.includes("filling") ||
    text.includes("реставрац");

  if (hasExtraction) {
    return (
      "Если откладывать удаление, инфекция может распространиться на соседние зубы и кость — " +
      "это приведёт к более сложному лечению и дополнительным расходам 😔"
    );
  }
  if (hasRootCanal) {
    return (
      "Если не лечить пульпит, воспаление перейдёт вглубь — в корень и кость. " +
      "Это сильная боль и высокий риск потери зуба 😔"
    );
  }
  if (hasCrown) {
    return (
      "Без коронки зуб остаётся хрупким: небольшая нагрузка может его сломать или " +
      "потребовать полного удаления 😔"
    );
  }
  if (hasCaries) {
    return (
      "Если отложить лечение, кариес углубится до нерва — и тогда вместо простой пломбы " +
      "потребуется более сложная и дорогостоящая процедура 😔"
    );
  }
  return (
    "Если откладывать визит, состояние зуба будет ухудшаться — " +
    "что приведёт к более длительному и дорогостоящему лечению 😔"
  );
}

function buildToothLines(problems: ToothProblem[]): string {
  const visible = problems.slice(0, MAX_TOOTH_LINES);
  const lines = visible
    .map((p) => `🦷 Зуб ${p.toothFdi} — ${p.label}`)
    .join("\n");

  const remaining = problems.length - MAX_TOOTH_LINES;
  if (remaining > 0) {
    return `${lines}\n…и ещё ${formatRemainingTeethCount(remaining)} в плане лечения`;
  }
  return lines;
}

function buildMessage(patientName: string, problems: ToothProblem[]): string | null {
  if (problems.length === 0) return null;

  const firstName = patientName.trim().split(" ")[0] ?? patientName;
  const toothLines = buildToothLines(problems);
  const urgency = getUrgencyMessage(problems);

  return (
    `Здравствуйте, ${firstName} 👋\n` +
    `У вас остались зубы, которые ещё требуют лечения:\n\n` +
    `${toothLines}\n\n` +
    `${urgency}\n\n` +
    `Ваш план лечения сохранён.\n` +
    `Напишите «Продолжить», и мы подберём удобное время 🤍`
  );
}

async function isBroadcastAiEnabled(clinicId: string): Promise<boolean> {
  const [row] = await db
    .select({ broadcastAiEnabled: chatbotSettingsTable.broadcastAiEnabled })
    .from(chatbotSettingsTable)
    .where(eq(chatbotSettingsTable.clinicId, clinicId))
    .limit(1);
  return row?.broadcastAiEnabled ?? false;
}

async function resolveBroadcastMessage(
  clinicId: string,
  patientName: string,
  problems: ToothProblem[],
  aiEnabled: boolean,
  clinicName?: string,
): Promise<{ message: string | null; usedAi: boolean }> {
  const template = buildMessage(patientName, problems);
  if (!template) return { message: null, usedAi: false };
  if (!aiEnabled) return { message: template, usedAi: false };

  const { message, usedAi } = await generateBroadcastMessageAi({
    clinicId,
    patientName,
    problems,
    clinicName,
    fallbackMessage: template,
  });
  return { message, usedAi };
}

async function insertBroadcastRun(
  clinicId: string,
  totalPatients: number,
): Promise<typeof dentalBroadcastRunsTable.$inferSelect> {
  const [run] = await db
    .insert(dentalBroadcastRunsTable)
    .values({
      id: randomUUID(),
      clinicId,
      runDate: todayDateString(),
      status: "running",
      totalPatients,
      processedPatients: 0,
      messagesSent: 0,
      errorsCount: 0,
    })
    .returning();
  return run!;
}

async function executeBroadcastRun(runId: string, clinicId: string): Promise<void> {
  const patients = await fetchPatientsForBroadcast(clinicId);
  const aiEnabled = await isBroadcastAiEnabled(clinicId);
  const [clinicRow] = await db
    .select({ name: clinicsTable.name })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId))
    .limit(1);
  const clinicName = clinicRow?.name;

  await db
    .update(dentalBroadcastRunsTable)
    .set({ totalPatients: patients.length })
    .where(eq(dentalBroadcastRunsTable.id, runId));

  logger.info(
    { clinicId, runId, totalPatients: patients.length, aiEnabled },
    "[DentalBroadcast] Run started",
  );

  let messagesSent = 0;
  let errorsCount = 0;

  for (let i = 0; i < patients.length; i++) {
    const patient = patients[i]!;
    try {
      if (wasRecentlyBroadcast(patient)) {
        logger.info(
          {
            patientId: patient.id,
            status: patient.status,
            updatedAt: patient.updatedAt,
            dedupDays: DEDUP_DAYS,
          },
          "[DentalBroadcast] Skipping patient — broadcast sent within dedup window",
        );
        continue;
      }

      const problems = await getPatientProblems(clinicId, patient.id);
      const { message, usedAi } = await resolveBroadcastMessage(
        clinicId,
        patient.name,
        problems,
        aiEnabled,
        clinicName,
      );

      if (message && patient.phone) {
        const msgId = await sendToPatient(clinicId, patient.phone, message);
        if (msgId) {
          messagesSent++;
          logger.info(
            { patientId: patient.id, msgId, toothCount: problems.length, usedAi },
            "[DentalBroadcast] Message delivered",
          );
          const messageRowId = randomUUID();
          await db
            .insert(messagesTable)
            .values({
              id: messageRowId,
              clinicId,
              patientId: patient.id,
              direction: "outbound",
              senderId: null,
              content: message,
              whatsappMessageId: msgId,
              isRedAlert: false,
            })
            .catch((err) =>
              logger.error(
                { err, patientId: patient.id, msgId },
                "[DentalBroadcast] Failed to persist outbound message",
              ),
            );
          await db
            .insert(dentalBroadcastDeliveriesTable)
            .values({
              id: randomUUID(),
              clinicId,
              runId,
              patientId: patient.id,
              messageId: messageRowId,
              content: message,
              usedAi,
            })
            .catch((err) =>
              logger.error(
                { err, patientId: patient.id, runId },
                "[DentalBroadcast] Failed to persist delivery record",
              ),
            );
          await db
            .update(patientsTable)
            .set({ status: "repeat_sale", updatedAt: new Date() })
            .where(eq(patientsTable.id, patient.id));
        } else {
          logger.warn(
            { patientId: patient.id },
            "[DentalBroadcast] sendToPatient returned empty — no provider configured",
          );
        }
      } else {
        logger.info(
          { patientId: patient.id },
          "[DentalBroadcast] No problems found — skipping patient",
        );
      }
    } catch (err) {
      logger.warn(
        { err, patientId: patient.id },
        "[DentalBroadcast] Error processing patient",
      );
      errorsCount++;
    }

    await db
      .update(dentalBroadcastRunsTable)
      .set({ processedPatients: i + 1, messagesSent, errorsCount })
      .where(eq(dentalBroadcastRunsTable.id, runId));
  }

  await db
    .update(dentalBroadcastRunsTable)
    .set({
      status: "completed",
      processedPatients: patients.length,
      messagesSent,
      errorsCount,
      completedAt: new Date(),
    })
    .where(eq(dentalBroadcastRunsTable.id, runId));

  logger.info(
    { clinicId, runId, messagesSent, errorsCount },
    "[DentalBroadcast] Run completed",
  );
}

export async function runDentalBroadcastForClinic(
  clinicId: string,
): Promise<typeof dentalBroadcastRunsTable.$inferSelect> {
  const totalPatients = await countPatientsForBroadcast(clinicId);
  const run = await insertBroadcastRun(clinicId, totalPatients);

  executeBroadcastRun(run.id, clinicId).catch((err) => {
    logger.error(
      { err, clinicId, runId: run.id },
      "[DentalBroadcast] Background execution error",
    );
    db.update(dentalBroadcastRunsTable)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(dentalBroadcastRunsTable.id, run.id))
      .catch(() => {});
  });

  return run;
}

export async function runDentalBroadcastForAllClinics(): Promise<void> {
  const clinics = await db
    .select({ id: clinicsTable.id })
    .from(clinicsTable)
    .where(
      and(
        isNotNull(clinicsTable.greenApiInstanceId),
        ne(clinicsTable.greenApiInstanceId, ""),
        isNotNull(clinicsTable.greenApiToken),
        ne(clinicsTable.greenApiToken, ""),
      ),
    );

  const runDate = todayDateString();

  for (const clinic of clinics) {
    const [existing] = await db
      .select({ id: dentalBroadcastRunsTable.id })
      .from(dentalBroadcastRunsTable)
      .where(
        and(
          eq(dentalBroadcastRunsTable.clinicId, clinic.id),
          eq(dentalBroadcastRunsTable.runDate, runDate),
        ),
      )
      .limit(1);

    if (existing) {
      logger.info(
        { clinicId: clinic.id, runDate },
        "[DentalBroadcast] Already ran today — skipping",
      );
      continue;
    }

    runDentalBroadcastForClinic(clinic.id).catch((err) => {
      logger.error(
        { err, clinicId: clinic.id },
        "[DentalBroadcast] Fire-and-forget failed",
      );
    });
  }
}
