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

  const scriptSection =
    opts.script.fullScript.trim() ||
    [opts.script.compactPath.trim(), opts.script.outgoingTransitions.trim()]
      .filter(Boolean)
      .join("\n") ||
    "(скрипт не задан — следуй этапам FSM)";

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
    "2. Сначала ответь на ПРЯМОЙ вопрос пациента по FACTS (филиалы, цены, услуги, адреса). Не игнорируй вопрос ради скрипта.",
    "3. После ответа — вторым сообщением (replyParts) мягко веди к записи: удобное время, выбор филиала, подтверждение.",
    "4. Кратко: 1-3 предложения на сообщение. Импровизируй естественно, не читай инструкцию узла дословно.",
    "5. replyParts — обязательно когда: дал инфо об услуге → спроси время визита; упомянул филиалы → вынеси полный список адресов; пациент выбрал филиал → поблагодари.",
    "6. Не начинай диалог заново и не пиши «чем могу помочь», если пациент уже в процессе записи.",
    "7. Филиалы: если спрашивают какие есть — reply с кратким вступлением, replyParts[0] = полный нумерованный список из FACTS.",
    "8. Не выдумывай адреса, цены, врачей — только FACTS. Если факта нет — честно скажи.",
    "9. mindMapNodeId: оставайся на текущем узле, пока пациент задаёт вопросы; меняй узел только когда этап реально пройден.",
    "10. Сервер тоже проверяет переходы — не перескакивай этапы без ответа пациента.",
    "",
    "=== OUTPUT ===",
    "Верни ТОЛЬКО валидный JSON без markdown:",
    AGENT_JSON_SCHEMA,
  ]
    .filter(Boolean)
    .join("\n");
}
