import { openrouter, DEEPSEEK_MODEL } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";

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

Отвечай ТОЛЬКО валидным JSON без объяснений:
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
    const response = await openrouter.chat.completions.create({
      model: DEEPSEEK_MODEL,
      max_tokens: 512,
      temperature: 0.1,
      messages,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<ClassificationResult>;

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

    if (attempt < 3) {
      const delay = isRateLimit ? 2000 * (attempt + 1) : 500 * (attempt + 1);
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

export async function generateChatbotResponse(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  fewShotExamples?: ManagerExample[],
): Promise<string | null> {
  const extraSystemMessages: Array<{ role: "system"; content: string }> = [];
  const fewShot: Array<{ role: "user" | "assistant"; content: string }> = [];

  if (fewShotExamples && fewShotExamples.length > 0) {
    extraSystemMessages.push({
      role: "system",
      content:
        "Ниже — примеры стиля общения менеджера клиники. Точно копируй их тон, длину ответов и использование эмодзи:",
    });
    for (const ex of fewShotExamples.slice(0, 10)) {
      fewShot.push({ role: "user", content: ex.userMessage });
      fewShot.push({ role: "assistant", content: ex.managerResponse });
    }
  }

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...extraSystemMessages,
    ...fewShot,
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  try {
    const response = await openrouter.chat.completions.create({
      model: DEEPSEEK_MODEL,
      max_tokens: 300,
      temperature: 0.7,
      messages,
    });
    return response.choices[0]?.message?.content ?? null;
  } catch (err) {
    logger.error({ err }, "[AIClassifier] generateChatbotResponse failed — using fallback text");
    return null;
  }
}

// ─── Datetime extractor ───────────────────────────────────────────────────────

export async function extractDatetimeFromText(text: string): Promise<Date | null> {
  const now = new Date();
  const todayStr = now.toLocaleDateString("ru-KZ", { day: "2-digit", month: "2-digit", year: "numeric" });

  const systemPrompt = `Сегодня ${todayStr} (${now.toISOString()}).
Извлеки из текста пациента дату и время визита. Верни JSON: {"iso": "YYYY-MM-DDTHH:mm:00"} или {"iso": null} если дата/время не указаны или неясны.
Казахские слова дней: ертең=завтра, бүгін=сегодня, дүйсенбі=понедельник, сейсенбі=вторник, сәрсенбі=среда, бейсенбі=четверг, жұма/жума=пятница, сенбі=суббота, жексенбі=воскресенье.
Казахские слова времени: таңертең/тангертен=утро(09:00), күндізгі/кундизги=день(13:00), кешкі/кешки=вечер(17:00).
Если время не указано — ставь 10:00. Дата должна быть >= сегодня.`;

  try {
    const response = await openrouter.chat.completions.create({
      model: DEEPSEEK_MODEL,
      max_tokens: 80,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { iso?: string | null };
    if (!parsed.iso) return null;

    const date = new Date(parsed.iso);
    if (isNaN(date.getTime())) return null;

    const sixMonthsLater = new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000);
    if (date < now || date > sixMonthsLater) return null;

    return date;
  } catch (err) {
    logger.error({ err }, "[AIClassifier] extractDatetimeFromText failed");
    return null;
  }
}
