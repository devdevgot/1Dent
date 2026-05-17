import { openrouter, FAST_MODEL, parseLlmJson, withTimeout } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import type { FieldMapping } from "@workspace/db";

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
 * Uses AI to detect dynamic placeholders in a contract template text
 * and map each placeholder to a known patient field.
 */
export async function analyzeContractFields(
  text: string,
): Promise<FieldMapping[]> {
  const truncated = text.slice(0, 8000);

  const systemPrompt = `Ты — система анализа договоров стоматологической клиники.
Тебе дают текст договора. Найди все динамические поля/плейсхолдеры — места, где нужно подставить данные конкретного пациента.
Типичные маркеры: ____, [...], {{}}, «заполнить», пустые строки в ФИО/дата/ИИН/телефон, а также явные метки.

Для каждого найденного поля заполни объект:
{
  "placeholder": "точная подстрока из текста (например '__ФИО__' или '__________')",
  "patientField": "одно из: patient.name | patient.phone | patient.iin | patient.dateOfBirth | patient.gender | doctor.name | clinic.name | date.today | date.year",
  "label": "человекочитаемое название поля на русском"
}

Верни JSON-объект вида: { "fields": [ ...массив объектов... ] }
Если динамических полей нет — верни { "fields": [] }.`;

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
    // AI may return { fields: [...] } or just [...]
    const parsed = parseLlmJson<FieldMapping[] | { fields: FieldMapping[] }>(raw);
    if (!parsed) return [];
    if (Array.isArray(parsed)) return parsed;
    if ("fields" in parsed && Array.isArray(parsed.fields)) return parsed.fields;
    return [];
  } catch (err) {
    logger.error({ err }, "[contracts.ai] analyzeContractFields failed");
    return [];
  }
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

function textToHtml(text: string): string {
  return text
    .split(/\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
