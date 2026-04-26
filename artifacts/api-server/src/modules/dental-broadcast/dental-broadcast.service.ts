import { randomUUID } from "crypto";
import { db, dentalBroadcastRunsTable, dentalAiAnalysesTable, patientsTable, clinicsTable } from "@workspace/db";
import { eq, and, isNotNull, ne } from "drizzle-orm";
import { openrouter } from "../../lib/openrouter-client";
import { sendToPatient } from "../../shared/messaging";
import { logger } from "../../lib/logger";

const GEMINI_MODEL = "google/gemini-2.0-flash-001";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchPatientsForBroadcast(clinicId: string) {
  return db
    .select({
      id: patientsTable.id,
      phone: patientsTable.phone,
      reportText: dentalAiAnalysesTable.reportText,
    })
    .from(dentalAiAnalysesTable)
    .innerJoin(patientsTable, eq(patientsTable.id, dentalAiAnalysesTable.patientId))
    .where(
      and(
        eq(dentalAiAnalysesTable.clinicId, clinicId),
        isNotNull(patientsTable.phone),
        ne(patientsTable.phone, ""),
      ),
    );
}

export async function createBroadcastRun(clinicId: string): Promise<typeof dentalBroadcastRunsTable.$inferSelect> {
  const patients = await fetchPatientsForBroadcast(clinicId);
  const runId = randomUUID();
  const runDate = todayDateString();

  const [run] = await db
    .insert(dentalBroadcastRunsTable)
    .values({
      id: runId,
      clinicId,
      runDate,
      status: "running",
      totalPatients: patients.length,
      processedPatients: 0,
      messagesSent: 0,
      errorsCount: 0,
    })
    .returning();

  return run!;
}

export async function executeBroadcastRun(runId: string, clinicId: string): Promise<void> {
  const patients = await fetchPatientsForBroadcast(clinicId);

  logger.info({ clinicId, runId, totalPatients: patients.length }, "[DentalBroadcast] Run started");

  let messagesSent = 0;
  let errorsCount = 0;

  for (let i = 0; i < patients.length; i++) {
    const patient = patients[i]!;
    try {
      const aiResponse = await openrouter.chat.completions.create({
        model: GEMINI_MODEL,
        max_tokens: 400,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Ты — стоматолог-консультант клиники. Проанализируй отчёт о зубном здоровье пациента и определи, " +
              "нужно ли пригласить его на консультацию или лечение. " +
              "Отвечай строго в JSON: { \"needsMessage\": true/false, \"message\": \"текст\" или null }. " +
              "Если у пациента нет серьёзных проблем — верни needsMessage: false. " +
              "Если есть тревожные находки — составь короткое тёплое сообщение на русском языке (2–3 предложения), " +
              "не упоминай конкретные диагнозы, просто пригласи на консультацию. Не используй слово 'зубная карта'.",
          },
          {
            role: "user",
            content: `Отчёт о зубном здоровье пациента:\n\n${patient.reportText}`,
          },
        ],
      });

      const rawContent = aiResponse.choices[0]?.message?.content ?? "{}";
      let parsed: { needsMessage?: boolean; message?: string | null } = {};
      try {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
      } catch {
        logger.warn({ patientId: patient.id, rawContent }, "[DentalBroadcast] Failed to parse AI JSON");
        errorsCount++;
      }

      if (parsed.needsMessage && parsed.message && patient.phone) {
        await sendToPatient(clinicId, patient.phone, parsed.message);
        messagesSent++;
        logger.info({ patientId: patient.id }, "[DentalBroadcast] Message sent");
      }
    } catch (err) {
      logger.warn({ err, patientId: patient.id }, "[DentalBroadcast] Error processing patient");
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

  logger.info({ clinicId, runId, messagesSent, errorsCount }, "[DentalBroadcast] Run completed");
}

export async function runDentalBroadcastForClinic(clinicId: string): Promise<typeof dentalBroadcastRunsTable.$inferSelect> {
  const run = await createBroadcastRun(clinicId);
  executeBroadcastRun(run.id, clinicId).catch((err) => {
    logger.error({ err, clinicId, runId: run.id }, "[DentalBroadcast] Background execution error");
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
      logger.info({ clinicId: clinic.id, runDate }, "[DentalBroadcast] Already ran today — skipping");
      continue;
    }

    runDentalBroadcastForClinic(clinic.id).catch((err) => {
      logger.error({ err, clinicId: clinic.id }, "[DentalBroadcast] Fire-and-forget failed");
    });
  }
}
