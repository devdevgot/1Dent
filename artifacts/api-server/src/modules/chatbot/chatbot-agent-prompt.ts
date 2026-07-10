import type { ChatbotState } from "./chatbot.types";
import type { ChatbotPromptFacts } from "./chatbot-prompt-builder";
import { buildFactsBlock } from "./chatbot-prompt-builder";
import type { AgentScriptContext } from "./chatbot-agent-context";
import { CHATBOT_AGENT_ACTION_TYPES } from "./chatbot-agent.types";

export interface BuildAgentPromptOpts {
  clinicName: string;
  channel: "playground" | "whatsapp";
  script: AgentScriptContext;
  facts: ChatbotPromptFacts;
  fsmState: ChatbotState;
  sessionSummary?: string;
}

const AGENT_JSON_SCHEMA = `{
  "reply": "первое сообщение пациенту (ответ/инфо)",
  "replyParts": ["второе сообщение — следующий шаг воронки", "третье при необходимости"],
  "mindMapNodeId": "id узла из «Доступные переходы» или текущий",
  "fsmHint": "greeting|collect_problem|collect_qualification|suggest_doctor|await_decision|collect_datetime|done|human_takeover",
  "intent": {
    "serviceType": "therapy|hygiene|surgery|orthopedics|orthodontics|consultation|unknown",
    "urgency": "urgent|soon|planned",
    "selectedBranch": "точный филиал из FACTS или null",
    "patientName": "имя или null",
    "preferredDatetime": "ISO или null",
    "problemDescription": "кратко или null"
  },
  "actions": [{ "type": "suggest_doctor" }],
  "handoff": false
}`;

/** System prompt for script-guided agent orchestrator. */
export function buildAgentOrchestratorPrompt(opts: BuildAgentPromptOpts): string {
  const channelNote =
    opts.channel === "playground"
      ? "Режим playground: отвечай ИДЕНТИЧНО реальному WhatsApp-диалогу (та же модель и логика). Записи, пациенты и уведомления на сервере не создаются — только симуляция, но текст для пациента должен быть таким же."
      : "Реальный диалог WhatsApp.";

  const toolsList = CHATBOT_AGENT_ACTION_TYPES.map((t) => `- ${t}`).join("\n");

  const factsBlock = buildFactsBlock(opts.facts, opts.fsmState);

  const scriptSection = [
    opts.script.compactPath.trim(),
    opts.script.outgoingTransitions.trim(),
  ]
    .filter(Boolean)
    .join("\n") || "(скрипт не задан — следуй этапам FSM)";

  return [
    "=== ROLE ===",
    `Ты — AI-ассистент стоматологической клиники «${opts.clinicName}».`,
    channelNote,
    "SCRIPT (mind map) — это контекст и ориентир этапа записи, НЕ жёсткий текст для чтения вслух.",
    "Ты ведёшь живой диалог: сначала отвечаешь на вопрос пациента, затем мягко возвращаешь к записи если уместно.",
    "Ты не врач — не ставишь диагнозы.",
    "",
    "=== SCRIPT (контекст этапа — не шаблон) ===",
    scriptSection,
    "",
    "=== ТЕКУЩИЙ УЗЕЛ ===",
    `id: ${opts.script.currentNodeId}`,
    `label: ${opts.script.currentNodeLabel}`,
    `fsm: ${opts.script.currentFsmState ?? opts.fsmState}`,
    `инструкция: ${opts.script.currentNodeContent || "—"}`,
    opts.script.compactPath.trim(),
    "",
    opts.script.outgoingTransitions,
    "",
    "=== FSM REFERENCE (справочник этапов) ===",
    "greeting → collect_problem → collect_qualification → suggest_doctor → await_decision → collect_datetime → confirm → done",
    "manage_appointment — для существующей записи; handle_objections — сомнения; human_takeover — оператор.",
    "",
    "=== FACTS (единственный источник фактов) ===",
    factsBlock,
    opts.sessionSummary ? `\n=== SESSION ===\n${opts.sessionSummary}` : "",
    "",
    "=== TOOLS (actions) ===",
    "Вызывай actions когда нужно выполнить операцию. Не обещай запись текстом без book_appointment.",
    toolsList,
    "",
    "=== BEHAVIOR ===",
    "1. Язык пациента (ru/kz/en).",
    "2. КРАТКО: 1–2 предложения на reply/replyParts. Без скидок, акций, часов работы — если не спрашивали.",
    "3. Сначала ответь на прямой вопрос по FACTS. Затем replyParts — один короткий вопрос к записи.",
    "4. replyParts обязательны: инфо об услуге → «Подскажите удобное время?»; филиалы → список адресов; «да» врачу → «Когда удобно прийти?»",
    "5. ЗАПРЕЩЕНО передавать администратору — вызывай actions: suggest_doctor, show_slots, book_appointment.",
    "6. На «да» после врача: actions show_slots + fsmHint collect_datetime. Не хвали врача длинным текстом.",
    "7. Филиалы — только из FACTS. Не выдумывай адреса, цены, врачей.",
    "8. mindMapNodeId меняй только когда этап реально пройден.",
    "9. Сервер проверяет переходы — не перескакивай этапы.",
    "",
    "=== OUTPUT ===",
    "Верни ТОЛЬКО валидный JSON без markdown:",
    AGENT_JSON_SCHEMA,
  ]
    .filter(Boolean)
    .join("\n");
}
