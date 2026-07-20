import { randomUUID } from "crypto";
import { db, dentalAiAnalysesTable, toothRecordsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { openrouter, DEEPSEEK_MODEL } from "../../lib/openrouter-client";
import { aiCreditsService } from "../../shared/ai-credits";
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

// ── In-memory dedup cache ────────────────────────────────────────────────────
// Prevents calling OpenRouter multiple times for the same teeth state.
// Keyed by "clinicId:patientId" → { hash, triggeredAt }
// Lost on server restart — that's acceptable (at most 1 extra call after restart).
const analysisDeupCache = new Map<string, { hash: string; triggeredAt: number }>();

// ── Debounced trigger ────────────────────────────────────────────────────────
// Bulk saves (voice diagnosis applies 20-30 tooth updates in quick succession)
// used to fire one analysis per tooth: every PUT changes the teeth hash, so the
// dedup cache never kicked in — burning 5 credits per tooth and hammering the
// AI provider. Debouncing collapses a burst of updates into a single analysis.
const ANALYSIS_DEBOUNCE_MS = 8_000;
const pendingAnalysisTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleDentalAiAnalysis(clinicId: string, patientId: string): void {
  const key = `${clinicId}:${patientId}`;
  const existing = pendingAnalysisTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingAnalysisTimers.delete(key);
    triggerDentalAiAnalysis(clinicId, patientId).catch((err) =>
      logger.warn({ err, clinicId, patientId }, "[DentalAI] Debounced analysis error"),
    );
  }, ANALYSIS_DEBOUNCE_MS);
  timer.unref?.();
  pendingAnalysisTimers.set(key, timer);
}

function computeTeethHash(
  teeth: Array<{ toothFdi: number; condition: string; notes: string | null }>,
): string {
  const sorted = [...teeth].sort((a, b) => a.toothFdi - b.toothFdi);
  const str = sorted.map((t) => `${t.toothFdi}:${t.condition}:${t.notes ?? ""}`).join("|");
  // FNV-1a-style hash — fast, no dependencies
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

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

Важно: не упоминай имя пациента, не давай диагнозов по общим заболеваниям, оставайся в рамках стоматологии. Пиши чётко и профессионально. Не используй markdown-разметку жирного текста (**слово**) и курсива (*слово*) — только обычный текст и заголовки ## .`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });
  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("Empty response from AI");
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
}

export async function triggerDentalAiAnalysis(
  clinicId: string,
  patientId: string,
  force = false,
): Promise<void> {
  try {
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

    const currentHash = computeTeethHash(teeth);
    const cacheKey = `${clinicId}:${patientId}`;
    const cached = analysisDeupCache.get(cacheKey);

    if (!force) {
      // Skip if the same teeth state was already analyzed within the last 30 minutes
      const DEDUP_WINDOW_MS = 30 * 60 * 1000;
      if (cached && cached.hash === currentHash && Date.now() - cached.triggeredAt < DEDUP_WINDOW_MS) {
        logger.info({ clinicId, patientId }, "[DentalAI] Skipping — teeth unchanged since last analysis");
        return;
      }
    }

    // Mark as in-flight immediately to prevent concurrent duplicate calls
    analysisDeupCache.set(cacheKey, { hash: currentHash, triggeredAt: Date.now() });

    await aiCreditsService.consumeCredits({
      clinicId,
      feature: "dental_analysis",
      description: "AI-анализ состояния зубов",
    });

    const prompt = buildDentalPrompt(teeth);

    let reportText: string;
    try {
      reportText = await callOpenRouter(prompt, DEEPSEEK_MODEL);
    } catch (primaryErr) {
      logger.warn({ err: primaryErr, model: DEEPSEEK_MODEL }, "[DentalAI] Primary model failed, trying fallback");
      reportText = await callOpenRouter(prompt, FALLBACK_MODEL);
    }

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
    // On failure, evict cache entry so a retry is allowed
    analysisDeupCache.delete(`${clinicId}:${patientId}`);
    logger.error({ err, clinicId, patientId }, "[DentalAI] Failed to generate dental AI analysis");
  }
}

export async function deleteLatestDentalAnalysis(clinicId: string, patientId: string): Promise<void> {
  analysisDeupCache.delete(`${clinicId}:${patientId}`);
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
