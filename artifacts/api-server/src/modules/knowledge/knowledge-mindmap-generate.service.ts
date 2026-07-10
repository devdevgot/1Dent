import { createChatCompletion, FAST_MODEL, parseLlmJson } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import type { ScriptMindMapData } from "../chatbot/mindmap-utils.ts";
import {
  mergeMindMapWithDefault,
  normalizeMindMapInput,
  validateMindMapScript,
} from "../chatbot/mindmap-validator.ts";
import { DEFAULT_BOOKING_MIND_MAP } from "../chatbot/booking-script.ts";

const FSM_STATES_DOC = `
Допустимые fsmState: greeting, collect_problem, collect_qualification, suggest_doctor, await_decision,
collect_datetime, collect_branch, handle_objections, confirm_appointment, done, human_takeover, reactivation, manage_appointment.
`;

function buildMindMapPrompt(clinicNameNote: string, knowledgeText: string, branchNames: string[]): string {
  const branchesNote =
    branchNames.length > 0
      ? `Официальные филиалы клиники: ${branchNames.join("; ")}.`
      : "Филиалы — только из материалов клиники.";

  return `Ты — эксперт по скриптам продаж для стоматологической клиники в WhatsApp.
Создай ГЛАВНЫЙ скрипт продаж как mind map (граф узлов и рёбер) для AI-ассистента.

${clinicNameNote}
${branchesNote}

МАТЕРИАЛЫ КЛИНИКИ:
${knowledgeText}

${FSM_STATES_DOC}

Требования:
1. Корневой узел id="booking-root", isRoot=true, fsmState="greeting".
2. Обязательный путь: greeting → collect_problem (ветки услуг) → collect_qualification → suggest_doctor → await_decision → collect_datetime → confirm_appointment → done.
3. Ветки услуг от step1-intro: кариес, чистка, имплант, брекеты, протез, другое — каждая с fsmState="collect_problem".
4. Узел step2-branch (филиал) — покажи ВСЕ адреса в content, fsmState="collect_qualification".
5. У каждого узла: id (уникальный), label, content (конкретные фразы и тактика, 2-4 предложения), fsmState, position {x,y}.
6. У каждого ребра: id, source, target, label (триггер перехода: «болит зуб», «да», «подумать»).
7. content — только факты из материалов. Не выдумывай цены, адреса, имена врачей.
8. Минимум 15 узлов, минимум 14 рёбер.

Верни ТОЛЬКО JSON:
{
  "nodes": [
    { "id": "booking-root", "label": "...", "content": "...", "fsmState": "greeting", "isRoot": true, "position": { "x": 0, "y": 0 } }
  ],
  "edges": [
    { "id": "e-1", "source": "booking-root", "target": "step1-intro", "label": "начало" }
  ]
}`;
}

export async function generateMindMapFromKnowledge(
  clinicNameNote: string,
  knowledgeText: string,
  branchNames: string[] = [],
): Promise<{ mindMap: ScriptMindMapData; validation: ReturnType<typeof validateMindMapScript> }> {
  const trimmed = knowledgeText.slice(0, 14_000);

  for (const maxTokens of [12_000, 8000]) {
    try {
      const completion = await createChatCompletion(
        {
          model: FAST_MODEL,
          messages: [{ role: "user", content: buildMindMapPrompt(clinicNameNote, trimmed, branchNames) }],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: maxTokens,
        },
        { timeoutMs: 90_000, label: "knowledge-generate-mindmap" },
      );

      const raw = completion.choices[0]?.message?.content ?? null;
      const parsed = parseLlmJson<unknown>(raw);
      const normalized = normalizeMindMapInput(parsed);
      if (!normalized) {
        logger.warn({ rawSnippet: raw?.slice(0, 200) }, "[MindMapGenerate] Could not normalize LLM mind map");
        continue;
      }

      const merged = mergeMindMapWithDefault(normalized);
      const validation = validateMindMapScript(merged);
      return { mindMap: merged, validation };
    } catch (err) {
      logger.warn({ err, maxTokens }, "[MindMapGenerate] LLM call failed");
    }
  }

  logger.warn("[MindMapGenerate] Using default booking mind map with knowledge excerpt");
  const excerpt = trimmed.replace(/\s+/g, " ").slice(0, 800);
  const fallback = mergeMindMapWithDefault({
    ...DEFAULT_BOOKING_MIND_MAP,
    nodes: DEFAULT_BOOKING_MIND_MAP.nodes.map((n) =>
      n.id === "step1-intro" && excerpt
        ? { ...n, content: `${n.content}\n\nИз материалов клиники: ${excerpt}` }
        : n,
    ),
  });
  return { mindMap: fallback, validation: validateMindMapScript(fallback) };
}
