import type { ChatbotSessionData } from "./chatbot.types";
import { CHATBOT_AGENT_ACTION_TYPES } from "./chatbot-agent.types";

export interface BuildKnowledgeAgentPromptOpts {
  composedBasePrompt: string;
  clinicName: string;
  channel: "playground" | "whatsapp";
  phone: string;
  sessionData: ChatbotSessionData;
}

const AGENT_JSON_SCHEMA = `{
  "reply": "короткий ответ пациенту",
  "replyParts": ["второе сообщение если нужен список или уточнение"],
  "fsmHint": "collect_qualification",
  "intent": {
    "serviceType": "hygiene",
    "urgency": "planned",
    "selectedBranch": null,
    "patientName": null,
    "preferredDatetime": null,
    "problemDescription": null
  },
  "actions": [],
  "handoff": false
}`;

function buildSessionBlock(phone: string, data: ChatbotSessionData): string {
  const lines = [
    `Телефон: ${phone}`,
    `Имя: ${data.patientName ?? "не указано"}`,
    `Услуга: ${data.serviceType ?? "не уточнена"}`,
    `Жалоба: ${data.problemDescription ?? "—"}`,
    `Филиал: ${data.selectedBranch ?? "не выбран"}`,
    `Врач: ${data.suggestedDoctorName ?? "не подобран"}`,
    `Дата/время: ${data.preferredDatetime ?? "не выбрано"}`,
    `Запись создана: ${data.createdProcedureId ? "да" : "нет"}`,
  ];
  return lines.join("\n");
}

/** Wrap Opus-composed clinic prompt with per-turn session, tools, and JSON contract for Gemini. */
export function buildKnowledgeAgentPrompt(opts: BuildKnowledgeAgentPromptOpts): string {
  const channelNote =
    opts.channel === "playground"
      ? "Playground: отвечай как в реальном WhatsApp. Записи в БД не создаются, но текст для пациента тот же."
      : "Реальный диалог WhatsApp.";

  const toolsList = CHATBOT_AGENT_ACTION_TYPES.map((t) => `- ${t}`).join("\n");

  return [
    opts.composedBasePrompt,
    "",
    "=== КАНАЛ ===",
    channelNote,
    "",
    "=== ТЕКУЩАЯ СЕССИЯ ===",
    buildSessionBlock(opts.phone, opts.sessionData),
    "",
    "=== ИНСТРУМЕНТЫ (actions) ===",
    "Вызывай actions когда нужно выполнить операцию на сервере.",
    "Не обещай запись текстом без book_appointment когда все данные собраны.",
    toolsList,
    "",
    "=== ПОВЕДЕНИЕ ===",
    "1. Язык пациента (ru/kz/en).",
    "2. КРАТКО: 1–2 предложения. replyParts — для списков филиалов/слотов или одного уточняющего вопроса.",
    "3. Сначала ответь на прямой вопрос. Не привязывайся к этапам воронки.",
    "4. ЗАПРЕЩЕНО: скидки без запроса, передача администратору, выдуманные факты.",
    "5. fsmHint — только для внутренней аналитики (greeting, collect_problem, suggest_doctor, collect_datetime, done).",
    "",
    "=== OUTPUT ===",
    "Верни ТОЛЬКО валидный JSON без markdown.",
    AGENT_JSON_SCHEMA,
  ].join("\n");
}
