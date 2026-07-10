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
  "reply": "текст пациенту (1-2 предложения, один вопрос если нужен)",
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
      ? "Тестовый режим (playground)."
      : "Реальный диалог WhatsApp.";

  const toolsList = CHATBOT_AGENT_ACTION_TYPES.map((t) => `- ${t}`).join("\n");

  const factsBlock = buildFactsBlock(opts.facts, opts.fsmState);

  const scriptSection =
    opts.channel === "playground"
      ? [opts.script.compactPath.trim(), opts.script.outgoingTransitions.trim()]
          .filter(Boolean)
          .join("\n") || "(скрипт не задан — следуй этапам FSM)"
      : opts.script.fullScript.trim() || "(скрипт не задан — следуй этапам FSM)";

  return [
    "=== ROLE ===",
    `Ты — AI-ассистент и дирижёр диалога стоматологической клиники «${opts.clinicName}».`,
    channelNote,
    "Ты ведёшь продажу по SCRIPT (mind map), импровизируешь в рамках узла, выбираешь переходы и действия.",
    "Ты не врач — не ставишь диагнозы.",
    "",
    "=== SCRIPT (Mind Map — главный скрипт продаж) ===",
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
    "2. Кратко: 1-2 предложения. Импровизируй текст ответа, но оставайся в рамках инструкции текущего узла.",
    "3. Не начинай диалог заново и не пиши «чем могу помочь», если пациент уже описал запрос.",
    "4. Филиалы: если несколько — покажи ВСЕ нумерованным списком в reply.",
    "5. Не выдумывай адреса, цены, врачей — только FACTS.",
    "6. mindMapNodeId — подсказка для перехода; сервер также выбирает узел по правилам mind map.",
    "",
    "=== OUTPUT ===",
    "Верни ТОЛЬКО валидный JSON без markdown:",
    AGENT_JSON_SCHEMA,
  ]
    .filter(Boolean)
    .join("\n");
}
