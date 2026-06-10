import { openrouter, FAST_MODEL, parseLlmJson, withTimeout } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import { aiCreditsService } from "../../shared/ai-credits";
import type { FieldMapping } from "@workspace/db";
import { escapeHtml, textToHtml } from "./contract-render";

/** All patient fields we can auto-fill */
export const PATIENT_FIELDS: { field: string; label: string }[] = [
  { field: "patient.name",        label: "ФИО пациента" },
  { field: "patient.phone",       label: "Телефон пациента" },
  { field: "patient.iin",         label: "ИИН пациента" },
  { field: "patient.dateOfBirth", label: "Дата рождения" },
  { field: "patient.gender",      label: "Пол" },
  { field: "doctor.name",         label: "ФИО врача" },
  { field: "clinic.name",         label: "Название клиники" },
  { field: "date.today",          label: "Дата сегодня" },
  { field: "date.year",           label: "Год" },
];

/**
 * Regex-based heuristic for common Russian/Kazakh dental contract markers.
 * Catches "ФИО: ______", "ИИН ____", "Дата рождения: __.__.____" etc.
 * Always runs alongside AI so we never return an empty list when the document
 * clearly contains form fields.
 */
function detectFieldsByHeuristic(text: string): FieldMapping[] {
  const results: FieldMapping[] = [];
  const seen = new Set<string>();

  const patterns: Array<{ re: RegExp; patientField: string; label: string }> = [
    { re: /(Ф\.?\s*И\.?\s*О\.?\s*(?:пациента)?\s*[:\-]?\s*[_\s]{4,})/gi, patientField: "patient.name",        label: "ФИО пациента" },
    { re: /((?:фамилия[,\s]+имя[,\s]+отчество|полное\s+имя)\s*[:\-]?\s*[_\s]{4,})/gi, patientField: "patient.name", label: "ФИО пациента" },
    { re: /(ИИН\s*[:\-]?\s*[_\s\d]{6,})/gi,                              patientField: "patient.iin",         label: "ИИН пациента" },
    { re: /((?:тел(?:ефон)?\.?|моб(?:ильный)?\.?|контактный\s+тел[^\s_:-]*)\s*[:\-]?\s*[_\s\d+()-]{6,})/gi, patientField: "patient.phone", label: "Телефон пациента" },
    { re: /((?:дата\s+рождения|д\.?\s*р\.?)\s*[:\-]?\s*[_\s.\d/]{4,})/gi, patientField: "patient.dateOfBirth", label: "Дата рождения" },
    { re: /((?:^|\n)\s*пол\s*[:\-]?\s*[_\s]{3,})/gi,                     patientField: "patient.gender",      label: "Пол" },
    { re: /((?:врач|доктор|лечащий\s+врач)\s*[:\-]?\s*[_\s]{4,})/gi,     patientField: "doctor.name",         label: "ФИО врача" },
    { re: /((?:наименование\s+клиники|стомат[^\s_:-]+)\s*[:\-]?\s*[_\s]{4,})/gi, patientField: "clinic.name", label: "Название клиники" },
    { re: /((?:дата\s+(?:заключения|подписания|договора))\s*[:\-]?\s*[_\s.\d/]{4,})/gi, patientField: "date.today", label: "Дата сегодня" },
    { re: /(«\s*[_\s]{2,}\s*»\s*[_\s]{2,}\s*20[_\s\d]{2,}\s*г\.?)/gi,    patientField: "date.today",          label: "Дата сегодня" },
  ];

  for (const { re, patientField, label } of patterns) {
    for (const m of text.matchAll(re)) {
      const raw = m[0].trim().replace(/\s+/g, " ");
      const placeholder = raw.length > 80 ? raw.slice(0, 80) : raw;
      const key = `${patientField}::${placeholder}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ placeholder, patientField, label });
    }
  }
  return results;
}

/** Merge AI + heuristic results, deduping by placeholder. */
function mergeMappings(a: FieldMapping[], b: FieldMapping[]): FieldMapping[] {
  const seen = new Map<string, FieldMapping>();
  for (const m of [...a, ...b]) {
    if (!m || typeof m.placeholder !== "string" || !m.placeholder.trim()) continue;
    const key = m.placeholder.trim();
    if (!seen.has(key)) seen.set(key, m);
  }
  return Array.from(seen.values());
}

export async function analyzeContractFields(
  text: string,
  clinicId?: string,
  userId?: string | null,
): Promise<FieldMapping[]> {
  if (clinicId) {
    await aiCreditsService.consumeCredits({
      clinicId,
      userId,
      feature: "contract_ai",
    });
  }

  const truncated = text.slice(0, 8000);

  logger.info(
    {
      textLength: text.length,
      truncatedLength: truncated.length,
      preview: truncated.slice(0, 300),
    },
    "[contracts.ai] analyzeContractFields start",
  );

  // 1. Heuristic — fast and deterministic, always runs
  const heuristic = detectFieldsByHeuristic(truncated);

  const systemPrompt = `Ты — система анализа договоров стоматологической клиники.
Тебе дают текст договора. Найди ВСЕ места, куда нужно подставить данные конкретного пациента.

Ищи агрессивно — типичные сигналы:
- последовательности подчёркиваний: "____", "_______________", "_ _ _ _"
- метки с двоеточием: "ФИО:", "ИИН:", "Тел:", "Дата рождения:", "Адрес:"
- скобки и фигурные скобки: [____], {ФИО}, <ИИН>, {{name}}
- слова "пациент", "заполнить", "ввести"
- пустые поля в шаблонах: «___» «____» 20__ г.
- дата формата __.__.____ или __ . __ . ____

Даже если поле выглядит просто как длинная линия подчёркиваний — это ВЕРОЯТНО плейсхолдер; определи назначение по контексту (текст до и после).

Для каждого места заполни объект:
{
  "placeholder": "ТОЧНАЯ подстрока из текста (включи метку и подчёркивания, например 'ФИО: _______________')",
  "patientField": "одно из: patient.name | patient.phone | patient.iin | patient.dateOfBirth | patient.gender | doctor.name | clinic.name | date.today | date.year",
  "label": "человекочитаемое название на русском"
}

Верни JSON вида: { "fields": [ ... ] }. Если совсем ничего не нашёл — { "fields": [] }.`;

  let aiFields: FieldMapping[] = [];
  try {
    const completion = await withTimeout(
      openrouter.chat.completions.create({
        model: FAST_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: `Текст договора:\n\n${truncated}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      25_000,
      "analyzeContractFields",
    );

    const raw = completion.choices[0]?.message.content ?? "";
    logger.info({ rawSnippet: raw.slice(0, 500) }, "[contracts.ai] AI raw response");

    const parsed = parseLlmJson<FieldMapping[] | { fields: FieldMapping[] }>(raw);
    if (Array.isArray(parsed)) aiFields = parsed;
    else if (parsed && "fields" in parsed && Array.isArray(parsed.fields)) aiFields = parsed.fields;
  } catch (err) {
    logger.error({ err }, "[contracts.ai] AI call failed; falling back to heuristic only");
  }

  const merged = mergeMappings(aiFields, heuristic);
  logger.info(
    { aiCount: aiFields.length, heuristicCount: heuristic.length, mergedCount: merged.length },
    "[contracts.ai] analyzeContractFields done",
  );
  return merged;
}

/** Substitute patient data into the contract HTML using fieldMappings */
export function renderContractHtml(
  rawText: string,
  fieldMappings: FieldMapping[],
  patientData: Record<string, string>,
): string {
  let html = textToHtml(rawText);

  for (const mapping of fieldMappings) {
    const value = patientData[mapping.patientField] ?? `[${mapping.label}]`;
    // Escape special regex chars in placeholder
    const escaped = mapping.placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "g");
    html = html.replace(re, `<strong class="filled-field">${escapeHtml(value)}</strong>`);
  }

  return html;
}

