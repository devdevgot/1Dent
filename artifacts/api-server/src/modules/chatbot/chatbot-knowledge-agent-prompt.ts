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
  "reply": "пузырь 1: прямой ответ (1–2 предложения, без списков)",
  "replyParts": ["пузырь 2: список или один вопрос", "пузырь 3: опционально — запись/время"],
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
    "2. ВСЕГДА стремись к 2–3 пузырям: reply + replyParts (не пиши всё в reply).",
    "3. Пузырь 1 — ответ на вопрос. Пузырь 2 — список (филиалы 1️⃣2️⃣3️⃣, слоты) или один вопрос.",
    "4. Сначала ответь на прямой вопрос. Не привязывайся к этапам воронки.",
    "5. ЗАПРЕЩЕНО: скидки без запроса, передача администратору, выдуманные факты, длинные простыни.",
    "6. fsmHint — только для аналитики (greeting, collect_problem, suggest_doctor, collect_datetime, done).",
    "",
    "=== ПРИМЕРЫ reply + replyParts ===",
    'Цена: reply «Имплантация от X тг.» → replyParts: [«Когда удобно на консультацию?»]',
    'Филиалы: reply «У нас 3 филиала.» → replyParts: [«1️⃣ …\\n2️⃣ …\\nКакой удобнее?»]',
    'Запись: reply «Помогу с записью.» → replyParts: [«Что беспокоит?»]',
    "",
    "=== OUTPUT ===",
    "Верни ТОЛЬКО валидный JSON. Ответ должен начинаться с { и заканчиваться }.",
    "Без markdown, без комментариев, без текста до или после JSON.",
    AGENT_JSON_SCHEMA,
  ].join("\n");
}
