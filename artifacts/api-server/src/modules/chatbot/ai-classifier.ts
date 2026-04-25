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

Правила классификации serviceType:
- "therapy" — кариес, пломба, боль в зубе, чувствительность, пульпит, корневой канал
- "hygiene" — чистка, профилактика, снятие налёта/камня, отбеливание
- "surgery" — удаление зуба, имплант, синус-лифтинг, пародонт (хирургия)
- "orthopedics" — коронка, мост, протез, виниры, реставрация
- "orthodontics" — брекеты, элайнеры, прикус, выравнивание
- "consultation" — просто консультация, не знает что нужно, вопросы
- "unknown" — непонятно из сообщения

Правила urgency:
- "urgent" — сильная боль, опухоль, кровотечение, сломан зуб, срочно
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
Извлекай телефон если указан (в любом формате).

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
  if (!openrouter) {
    return {
      serviceType: "unknown",
      urgency: "planned",
      confidence: "low",
      patientType: "new",
      summary: message.slice(0, 100),
    };
  }

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
    // Include recent history for context (last 4 messages)
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

    logger.error({ err }, "[AIClassifier] Classification failed after retries");
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

export async function generateChatbotResponse(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
): Promise<string | null> {
  if (!openrouter) return null;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
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
    logger.error({ err }, "[AIClassifier] generateChatbotResponse failed");
    return null;
  }
}
