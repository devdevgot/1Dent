import {
  openrouter,
  FAST_MODEL,
  CHAT_MODEL,
  withTimeout,
  parseLlmJson,
} from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import {
  ALMATY_OFFSET,
  formatAlmatyDateLong,
  formatAlmatyIso,
  getAlmatyYmd,
  isInvalidAppointmentTime,
  parseAlmatyDatetime,
} from "./almaty-time";

export type ServiceType =
  | "therapy"
  | "hygiene"
  | "surgery"
  | "orthopedics"
  | "orthodontics"
  | "consultation"
  | "unknown";

export type Urgency = "urgent" | "soon" | "planned";
export type PatientType = "new" | "returning" | "vip";
export type Confidence = "high" | "low";

export interface ClassificationResult {
  serviceType: ServiceType;
  urgency: Urgency;
  confidence: Confidence;
  patientType: PatientType;
  extractedName?: string;
  extractedPhone?: string;
  summary: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const CLASSIFICATION_SYSTEM_PROMPT = `Ты — AI-ассистент стоматологической клиники. 
Твоя задача — проанализировать сообщение пациента и вернуть структурированный JSON-ответ.

ВАЖНО: Пациент может писать на казахском языке обычными кириллическими буквами вместо специфических казахских букв (ә→а/е, ғ→г, қ→к, ң→н, ө→о, ұ/ү→у, і→и). Например «тис аурады» = «тіс ауырады» (болит зуб), «жулу» = «жұлу» (удаление), «тазалоу» = «тазалау» (чистка).

Правила классификации serviceType:
- "therapy" — кариес, пломба, боль в зубе, чувствительность, пульпит, корневой канал
  Казахский: тіс ауырады, тіс ауру, тис аурады, тис аурады, ауырады, ауру
- "hygiene" — чистка, профилактика, снятие налёта/камня, отбеливание
  Казахский: тазалау, тазалоу, тіс тазалау, тіс тазалоу, ағарту, агарту
- "surgery" — удаление зуба, имплант, синус-лифтинг, пародонт (хирургия)
  Казахский: жұлу, жулу, суыру, алу, имплант
- "orthopedics" — коронка, мост, протез, виниры, реставрация
  Казахский: тәж, тажа, тәждеу, протез, винир
- "orthodontics" — брекеты, элайнеры, прикус, выравнивание
  Казахский: брекет, тіс түзету, тис тузету
- "consultation" — просто консультация, не знает что нужно, вопросы
  Казахский: кеңес, кенес, тексеру, қаралу, каралу
- "unknown" — непонятно из сообщения

Правила urgency:
- "urgent" — сильная боль, опухоль, кровотечение, сломан зуб, срочно
  Казахский: қатты ауырады, катты аурады, ісік, iciк, қан, кан
- "soon" — боль умеренная, запись на этой/следующей неделе
- "planned" — плановая запись, без срочности

Правила patientType:
- "vip" — упоминает имплант, All-on-4, протез, виниры (дорогостоящие услуги >50k ₸)
- "returning" — упоминает что уже был в клинике, знает врача, "снова хочу"
- "new" — новый пациент, всё остальное

confidence:
- "high" — чётко понятна услуга/проблема
- "low" — размыто, нужно уточнение

Извлекай имя если пациент представился.
Извлекай телефон если указан (в любом формате: +7, 8, 7, с пробелами/дефисами).

Отвечай ТОЛЬКО валидным JSON без объяснений, без markdown-обёрток, без префикса "json":
{
  "serviceType": "...",
  "urgency": "...", 
  "confidence": "...",
  "patientType": "...",
  "extractedName": "..." | null,
  "extractedPhone": "..." | null,
  "summary": "краткое описание проблемы на русском (1 предложение)"
}`;

async function classifyWithRetry(
  message: string,
  history: ChatMessage[],
  attempt = 0,
): Promise<ClassificationResult> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
    ...history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  try {
    const response = await withTimeout(
      openrouter.chat.completions.create({
        model: FAST_MODEL,
        max_tokens: 512,
        temperature: 0.1,
        messages,
        response_format: { type: "json_object" },
      }),
      15_000,
      "classifyPatientRequest",
    );

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = parseLlmJson<Partial<ClassificationResult>>(raw);
    if (!parsed) {
      throw new Error("classifier returned unparseable JSON");
    }

    return {
      serviceType: (parsed.serviceType as ServiceType) ?? "unknown",
      urgency: (parsed.urgency as Urgency) ?? "planned",
      confidence: (parsed.confidence as Confidence) ?? "low",
      patientType: (parsed.patientType as PatientType) ?? "new",
      extractedName: parsed.extractedName ?? undefined,
      extractedPhone: parsed.extractedPhone ?? undefined,
      summary: parsed.summary ?? message.slice(0, 100),
    };
  } catch (err) {
    const isRateLimit =
      err instanceof Error && (err.message.includes("429") || err.message.includes("rate"));

    if (attempt < 2) {
      const delay = isRateLimit ? 1500 * (attempt + 1) : 400 * (attempt + 1);
      logger.warn({ err, attempt }, "[AIClassifier] Retrying after error");
      await new Promise((r) => setTimeout(r, delay));
      return classifyWithRetry(message, history, attempt + 1);
    }

    logger.error({ err }, "[AIClassifier] Classification failed after retries — returning low-confidence fallback");
    return {
      serviceType: "unknown",
      urgency: "planned",
      confidence: "low",
      patientType: "new",
      summary: message.slice(0, 100),
    };
  }
}

export async function classifyPatientRequest(
  message: string,
  history: ChatMessage[] = [],
): Promise<ClassificationResult> {
  return classifyWithRetry(message, history);
}

// ─── AI response generator ───────────────────────────────────────────────────

export interface ManagerExample {
  userMessage: string;
  managerResponse: string;
}

/**
 * Detects patient language from conversation history (user messages only).
 * Returns null when not enough signal (e.g. empty history or only digits/IIN).
 */
function detectPatientLanguage(messages: ChatMessage[]): "kz" | "en" | null {
  const userText = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");

  if (!userText.trim() || /^\d+$/.test(userText.trim())) return null;

  // Kazakh-specific Unicode chars (always conclusive)
  if (/[әғқңөұүі]/.test(userText)) return "kz";

  // Common Kazakh Cyrillic words written without special chars
  if (
    /\b(рахмет|ракмет|жарайды|болады|болат|маған|сізге|менің|бармын|жоқ|жок|иә|ия|қайда|каида|немене|немене|қашан|каша|жазылу|ауырады|ауру|тіс|тис|тазалоу|тазалав|жулу|суыру|салем|сәлем|каирлы|кешіріңіз|кеширинизи)\b/i.test(
      userText,
    )
  )
    return "kz";

  // English signal
  if (/\b(hello|hi|yes|no|please|thank|want|need|help|appointment|tooth|teeth|pain|doctor|clinic)\b/i.test(userText))
    return "en";

  return null;
}

export async function generateChatbotResponse(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  fewShotExamples?: ManagerExample[],
): Promise<string | null> {
  const extraSystemMessages: Array<{ role: "system"; content: string }> = [];
  const fewShot: Array<{ role: "user" | "assistant"; content: string }> = [];

  // Detect patient language and enforce it strongly so the bot never switches
  const detectedLang = detectPatientLanguage(history);
  let finalSystemPrompt = systemPrompt;
  if (detectedLang === "kz") {
    finalSystemPrompt +=
      "\n\n⚠️ КРИТИЧЕСКИ ВАЖНО: Пациент пишет на КАЗАХСКОМ языке. " +
      "Отвечай ИСКЛЮЧИТЕЛЬНО на казахском языке на протяжении всего диалога. " +
      "Не используй русский язык ни в одном слове. " +
      "Пиши казахский текст кириллицей (можно без специальных букв: а вместо ә, г вместо ғ, к вместо қ и т.д.).";
  } else if (detectedLang === "en") {
    finalSystemPrompt +=
      "\n\n⚠️ IMPORTANT: The patient is writing in ENGLISH. " +
      "Respond EXCLUSIVELY in English throughout the entire conversation. Do not use Russian.";
  }

  if (fewShotExamples && fewShotExamples.length > 0) {
    extraSystemMessages.push({
      role: "system",
      content:
        "Ниже — примеры стиля общения менеджера клиники. Точно копируй их тон, длину ответов и использование эмодзи:",
    });
    for (const ex of fewShotExamples.slice(0, 8)) {
      fewShot.push({ role: "user", content: ex.userMessage });
      fewShot.push({ role: "assistant", content: ex.managerResponse });
    }
  }

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: finalSystemPrompt },
    ...extraSystemMessages,
    ...fewShot,
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  try {
    const response = await withTimeout(
      openrouter.chat.completions.create({
        model: CHAT_MODEL,
        max_tokens: 400,
        temperature: 0.6,
        messages,
      }),
      20_000,
      "generateChatbotResponse",
    );
    return response.choices[0]?.message?.content ?? null;
  } catch (err) {
    logger.error({ err }, "[AIClassifier] generateChatbotResponse failed — using fallback text");
    return null;
  }
}

// ─── Datetime extractor ───────────────────────────────────────────────────────

export async function extractDatetimeFromText(text: string): Promise<Date | null> {
  const now = new Date();
  const todayYmd = getAlmatyYmd(now);
  const todayLong = formatAlmatyDateLong(now);
  const nowAlmaty = formatAlmatyIso(now);

  const systemPrompt = `Сегодня в Алматы: ${todayLong} (${todayYmd}). Текущее время: ${nowAlmaty}.
Извлеки из текста пациента дату и время визита. Все даты и время интерпретируй строго в часовом поясе Алматы (UTC+5).
Слова «сегодня»/«бүгін» = ${todayYmd}, «завтра»/«ертең» = следующий день после ${todayYmd}.
Верни JSON: {"iso": "YYYY-MM-DDTHH:mm:00${ALMATY_OFFSET}"} или {"iso": null} если дата/время не указаны или неясны.
Казахские слова дней: ертең=завтра, бүгін=сегодня, дүйсенбі=понедельник, сейсенбі=вторник, сәрсенбі=среда, бейсенбі=четверг, жұма/жума=пятница, сенбі=суббота, жексенбі=воскресенье.
Казахские слова времени: таңертең/тангертен=утро(09:00), күндізгі/кундизги=день(13:00), кешкі/кешки=вечер(17:00).
Если время не указано — ставь 10:00. Дата визита должна быть не раньше сегодня (${todayYmd}).
Отвечай ТОЛЬКО валидным JSON без markdown-обёрток.`;

  try {
    const response = await withTimeout(
      openrouter.chat.completions.create({
        model: FAST_MODEL,
        max_tokens: 80,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
      }),
      12_000,
      "extractDatetimeFromText",
    );

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = parseLlmJson<{ iso?: string | null }>(raw);
    if (!parsed?.iso) return null;

    const date = parseAlmatyDatetime(parsed.iso);
    if (!date) return null;

    const sixMonthsLater = new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000);
    if (isInvalidAppointmentTime(date, now) || date > sixMonthsLater) return null;

    return date;
  } catch (err) {
    logger.error({ err }, "[AIClassifier] extractDatetimeFromText failed");
    return null;
  }
}

// ─── Branch/address extractor ──────────────────────────────────────────────────

export async function extractBranchFromText(text: string, knowledgeContext: string): Promise<string | null> {
  const systemPrompt = `Тебе предоставлена информация о клинике, включая её филиалы и адреса:
${knowledgeContext}

Твоя задача — определить, какой именно филиал или адрес выбрал пациент в своем сообщении.
Если пациент выбрал конкретный филиал/адрес из списка, верни JSON: {"branch": "Краткое название филиала/адреса"}.
Если в тексте нет явного выбора филиала или указанный адрес не соответствует материалам клиники, верни {"branch": null}.

Отвечай ТОЛЬКО валидным JSON без markdown-обёрток.`;

  try {
    const response = await withTimeout(
      openrouter.chat.completions.create({
        model: FAST_MODEL,
        max_tokens: 100,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
      }),
      12_000,
      "extractBranchFromText",
    );

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = parseLlmJson<{ branch?: string | null }>(raw);
    return parsed?.branch || null;
  } catch (err) {
    logger.error({ err }, "[AIClassifier] extractBranchFromText failed");
    return null;
  }
}
