import { randomUUID } from "crypto";
import { db, dentalAiAnalysesTable, toothRecordsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { openrouter, DEEPSEEK_MODEL } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";

const FALLBACK_MODEL = "openai/gpt-4o-mini";

const CONDITION_LABELS: Record<string, string> = {
  healthy: "Здоров",
  cavity: "Кариес",
  treated: "Пролечен",
  crown: "Коронка",
  root_canal: "Корневой канал",
  implant: "Имплант",
  missing: "Отсутствует",
  extraction_needed: "Требует удаления",
};

function buildDentalPrompt(teeth: Array<{ toothFdi: number; condition: string; notes: string | null }>): string {
  if (teeth.length === 0) {
    return "Данные о зубах пациента отсутствуют.";
  }

  const lines = teeth
    .sort((a, b) => a.toothFdi - b.toothFdi)
    .map((t) => {
      const condLabel = CONDITION_LABELS[t.condition] ?? t.condition;
      const notesPart = t.notes ? ` | Заметки: ${t.notes}` : "";
      return `  Зуб ${t.toothFdi}: ${condLabel}${notesPart}`;
    })
    .join("\n");

  return `Состояние зубов (по системе FDI):\n${lines}`;
}

async function callOpenRouter(prompt: string, model: string): Promise<string> {
  const response = await openrouter.chat.completions.create({
    model,
    max_tokens: 1024,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `Ты — опытный стоматолог-аналитик. Тебе предоставлены анонимизированные данные о состоянии зубов пациента по системе FDI (международная нумерация зубов: 11–18 верхний правый квадрант, 21–28 верхний левый, 31–38 нижний левый, 41–48 нижний правый). Проведи клинический анализ и дай структурированный отчёт на русском языке.

Структура отчёта (строго следуй этой структуре, используй эти заголовки):

## Общая оценка
[Краткая общая оценка состояния полости рта — 2-3 предложения]

## Проблемные зубы
[Для каждого проблемного зуба: номер FDI, диагноз, пояснение. Если нет проблемных зубов — напиши "Проблемных зубов не выявлено."]

## Приоритетные рекомендации
[Нумерованный список приоритетных рекомендаций по лечению, от срочных к плановым]

## Профилактика
[2-4 конкретных совета по профилактике для данного пациента]

Важно: не упоминай имя пациента, не давай диагнозов по общим заболеваниям, оставайся в рамках стоматологии. Пиши чётко и профессионально.`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });
  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("Empty response from AI");
  return text;
}

export async function triggerDentalAiAnalysis(clinicId: string, patientId: string): Promise<void> {
  try {
    // Load all tooth records — only FDI, condition, notes (no personal data)
    const teeth = await db
      .select({
        toothFdi: toothRecordsTable.toothFdi,
        condition: toothRecordsTable.condition,
        notes: toothRecordsTable.notes,
      })
      .from(toothRecordsTable)
      .where(
        and(
          eq(toothRecordsTable.clinicId, clinicId),
          eq(toothRecordsTable.patientId, patientId),
        ),
      );

    if (teeth.length === 0) {
      logger.info({ clinicId, patientId }, "[DentalAI] No tooth records found, skipping analysis");
      return;
    }

    const prompt = buildDentalPrompt(teeth);

    // Try DeepSeek V3 first, fall back to GPT-4o mini
    let reportText: string;
    try {
      reportText = await callOpenRouter(prompt, DEEPSEEK_MODEL);
    } catch (primaryErr) {
      logger.warn({ err: primaryErr, model: DEEPSEEK_MODEL }, "[DentalAI] Primary model failed, trying fallback");
      reportText = await callOpenRouter(prompt, FALLBACK_MODEL);
    }

    // Upsert — one report per patient, overwrite on every diagnosis
    const now = new Date();
    await db
      .insert(dentalAiAnalysesTable)
      .values({
        id: randomUUID(),
        clinicId,
        patientId,
        reportText,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [dentalAiAnalysesTable.clinicId, dentalAiAnalysesTable.patientId],
        set: { reportText, updatedAt: now },
      });

    logger.info({ clinicId, patientId }, "[DentalAI] Analysis saved successfully");
  } catch (err) {
    logger.error({ err, clinicId, patientId }, "[DentalAI] Failed to generate dental AI analysis");
  }
}

export async function deleteLatestDentalAnalysis(clinicId: string, patientId: string): Promise<void> {
  await db
    .delete(dentalAiAnalysesTable)
    .where(
      and(
        eq(dentalAiAnalysesTable.clinicId, clinicId),
        eq(dentalAiAnalysesTable.patientId, patientId),
      ),
    );
}

export async function getLatestDentalAnalysis(
  clinicId: string,
  patientId: string,
): Promise<{ reportText: string; updatedAt: Date } | null> {
  const [row] = await db
    .select({
      reportText: dentalAiAnalysesTable.reportText,
      updatedAt: dentalAiAnalysesTable.updatedAt,
    })
    .from(dentalAiAnalysesTable)
    .where(
      and(
        eq(dentalAiAnalysesTable.clinicId, clinicId),
        eq(dentalAiAnalysesTable.patientId, patientId),
      ),
    )
    .limit(1);
  return row ?? null;
}
