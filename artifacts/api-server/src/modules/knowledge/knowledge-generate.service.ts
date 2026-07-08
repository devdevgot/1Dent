import { createChatCompletion, FAST_MODEL, parseLlmJson } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import type { GeneratedScript, ScriptNode } from "@workspace/db";

const PRIMARY_TITLE = "Скрипт первичного обращения";
const REPEAT_TITLE = "Скрипт повторного обращения";

function normalizeNodes(nodes: unknown, depth = 0): ScriptNode[] {
  if (!Array.isArray(nodes) || depth > 4) return [];
  return nodes
    .filter((node) => node && typeof node === "object")
    .map((node, index) => {
      const row = node as Record<string, unknown>;
      const label = String(row["label"] ?? row["title"] ?? row["name"] ?? `Шаг ${index + 1}`);
      const detail = String(row["detail"] ?? row["content"] ?? row["description"] ?? "");
      return {
        id: String(row["id"] ?? `${depth}_${index + 1}`),
        label,
        detail,
        children: normalizeNodes(row["children"] ?? row["nodes"], depth + 1),
      };
    });
}

export function normalizeGeneratedScript(value: unknown, fallbackTitle: string): GeneratedScript | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;

  if (typeof obj["title"] === "string" && Array.isArray(obj["nodes"])) {
    const nodes = normalizeNodes(obj["nodes"]);
    if (nodes.length > 0) {
      return { title: obj["title"], nodes };
    }
  }

  for (const key of ["primaryScript", "repeatScript", "script", "data", "result"]) {
    const nested = obj[key];
    if (nested) {
      const normalized = normalizeGeneratedScript(nested, fallbackTitle);
      if (normalized) return normalized;
    }
  }

  if (Array.isArray(obj["nodes"])) {
    const nodes = normalizeNodes(obj["nodes"]);
    if (nodes.length > 0) {
      return { title: typeof obj["title"] === "string" ? obj["title"] : fallbackTitle, nodes };
    }
  }

  return null;
}

function buildPrompt(
  scriptKind: "primary" | "repeat",
  clinicNameNote: string,
  knowledgeText: string,
): string {
  const title = scriptKind === "primary" ? PRIMARY_TITLE : REPEAT_TITLE;
  const branches = scriptKind === "primary"
    ? "Приветствие, Выявление запроса, Презентация решения, Работа с возражениями, Запись на приём, FAQ"
    : "Тёплое приветствие, Причина паузы, Реактивация, Персональное предложение, Запись, Программа лояльности";

  return `Ты — эксперт по продажам в стоматологии. Создай один JSON-скрипт для чат-бота клиники.

${clinicNameNote}

МАТЕРИАЛЫ КЛИНИКИ:
${knowledgeText}

Задача: "${title}".
Обязательные ветви: ${branches}.
Сделай 5-7 главных узлов, у каждого 2-3 дочерних узла.
Используй только факты из материалов. Не выдумывай цены, адреса и имена.

Верни ТОЛЬКО JSON:
{
  "title": "${title}",
  "nodes": [
    {
      "id": "1",
      "label": "Название этапа",
      "detail": "Конкретные фразы и тактика",
      "children": [
        {
          "id": "1.1",
          "label": "Подэтап",
          "detail": "Пример реплики",
          "children": []
        }
      ]
    }
  ]
}`;
}

function buildFallbackScript(scriptKind: "primary" | "repeat", knowledgeText: string): GeneratedScript {
  const title = scriptKind === "primary" ? PRIMARY_TITLE : REPEAT_TITLE;
  const excerpt = knowledgeText.replace(/\s+/g, " ").trim().slice(0, 1200);
  const labels = scriptKind === "primary"
    ? ["Приветствие", "Выявление запроса", "Презентация", "Запись на приём", "FAQ"]
    : ["Приветствие", "Причина паузы", "Предложение", "Запись", "Лояльность"];

  return {
    title,
    nodes: labels.map((label, index) => ({
      id: String(index + 1),
      label,
      detail: excerpt || "Используйте материалы клиники из базы знаний.",
      children: [],
    })),
  };
}

async function generateSingleScript(
  scriptKind: "primary" | "repeat",
  clinicNameNote: string,
  knowledgeText: string,
): Promise<GeneratedScript | null> {
  const fallbackTitle = scriptKind === "primary" ? PRIMARY_TITLE : REPEAT_TITLE;

  for (const maxTokens of [8000, 5000]) {
    try {
      const completion = await createChatCompletion(
        {
          model: FAST_MODEL,
          messages: [{ role: "user", content: buildPrompt(scriptKind, clinicNameNote, knowledgeText) }],
          response_format: { type: "json_object" },
          temperature: 0.25,
          max_tokens: maxTokens,
        },
        { timeoutMs: 75_000, label: `knowledge-generate-${scriptKind}` },
      );

      const raw = completion.choices[0]?.message?.content ?? null;
      const parsed = parseLlmJson<unknown>(raw);
      const normalized = normalizeGeneratedScript(parsed, fallbackTitle);
      if (normalized) return normalized;

      logger.warn(
        { scriptKind, rawSnippet: raw?.slice(0, 240) ?? null },
        "[KnowledgeGenerate] Could not normalize LLM script response",
      );
    } catch (err) {
      logger.warn({ err, scriptKind, maxTokens }, "[KnowledgeGenerate] LLM call failed");
    }
  }

  return null;
}

export async function generateKnowledgeScripts(
  clinicNameNote: string,
  knowledgeText: string,
): Promise<{ primaryScript: GeneratedScript; repeatScript: GeneratedScript }> {
  const trimmedKnowledge = knowledgeText.slice(0, 16_000);

  const [primaryResult, repeatResult] = await Promise.all([
    generateSingleScript("primary", clinicNameNote, trimmedKnowledge),
    generateSingleScript("repeat", clinicNameNote, trimmedKnowledge),
  ]);

  const primaryScript = primaryResult ?? buildFallbackScript("primary", trimmedKnowledge);
  const repeatScript = repeatResult ?? buildFallbackScript("repeat", trimmedKnowledge);

  if (!primaryResult || !repeatResult) {
    logger.warn(
      { hasPrimary: Boolean(primaryResult), hasRepeat: Boolean(repeatResult) },
      "[KnowledgeGenerate] Used fallback script tree for missing LLM output",
    );
  }

  return { primaryScript, repeatScript };
}
