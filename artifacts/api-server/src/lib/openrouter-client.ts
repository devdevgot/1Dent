import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { OpenRouterNotConfiguredError } from "../shared/errors/index";
import { logger } from "./logger";

const baseURL = "https://openrouter.ai/api/v1";

let _client: OpenAI | null = null;

function getReferer(): string {
  return (
    process.env["PUBLIC_URL"] ??
    process.env["FRONTEND_URL"] ??
    process.env["WEBHOOK_BASE_URL"] ??
    "https://www.1dent.kz"
  );
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env["OPENROUTER_API_KEY"]?.trim());
}

export function assertOpenRouterConfigured(): void {
  if (!isOpenRouterConfigured()) {
    throw new OpenRouterNotConfiguredError();
  }
}

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env["OPENROUTER_API_KEY"]?.trim();
  if (!apiKey) {
    throw new OpenRouterNotConfiguredError();
  }
  _client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: {
      "HTTP-Referer": getReferer(),
      "X-Title": "1Dent",
    },
  });
  return _client;
}

/** Models where reasoning can be disabled without a 400 from OpenRouter. */
export function canDisableReasoning(model: string): boolean {
  const id = model.toLowerCase();
  if (id.includes("/o1") || id.includes("/o3") || id.includes("thinking")) return false;
  if (!id.includes("gemini")) return false;
  // Pro / mandatory-reasoning Gemini variants reject effort: "none".
  if (id.includes("pro")) return false;
  return id.includes("flash") || id.includes("lite");
}

export function isThinkingModel(model: string): boolean {
  const id = model.toLowerCase();
  return (
    id.includes("gemini") ||
    id.includes("/o1") ||
    id.includes("/o3") ||
    id.includes("thinking")
  );
}

function bumpMaxTokens(maxTokens: number | undefined | null, factor = 2, floor = 2048): number {
  return Math.max(maxTokens ?? 1024, floor) * factor;
}

function isReasoningRejectError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("400") &&
    (msg.includes("reasoning") || msg.includes("effort") || msg.includes("thinking"))
  );
}

type OpenRouterChatParams = ChatCompletionCreateParamsNonStreaming & {
  reasoning?: { effort?: string; max_tokens?: number; exclude?: boolean; enabled?: boolean };
};

function buildCompletionAttempts(
  params: ChatCompletionCreateParamsNonStreaming,
  opts?: { disableReasoning?: boolean },
): OpenRouterChatParams[] {
  const attempts: OpenRouterChatParams[] = [];
  const disableReasoning = opts?.disableReasoning ?? canDisableReasoning(params.model);

  if (disableReasoning) {
    attempts.push({ ...params, reasoning: { effort: "none" } });
  } else if (isThinkingModel(params.model)) {
    attempts.push({
      ...params,
      max_tokens: bumpMaxTokens(params.max_tokens),
      reasoning: { exclude: true },
    });
  }

  attempts.push({
    ...params,
    max_tokens: bumpMaxTokens(params.max_tokens, isThinkingModel(params.model) ? 2 : 1),
  });
  attempts.push(params);

  const seen = new Set<string>();
  return attempts.filter((body) => {
    const key = JSON.stringify(body);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function createChatCompletion(
  params: ChatCompletionCreateParamsNonStreaming,
  opts?: { timeoutMs?: number; label?: string; disableReasoning?: boolean },
): Promise<OpenAI.Chat.ChatCompletion> {
  const client = getClient();
  const attempts = buildCompletionAttempts(params, opts);
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const label = opts?.label ?? "openrouter";

  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const body = attempts[i]!;
    try {
      return await withTimeout(
        client.chat.completions.create(body as ChatCompletionCreateParamsNonStreaming),
        timeoutMs,
        label,
      );
    } catch (err) {
      lastErr = err;
      const hasAnotherAttempt = i < attempts.length - 1;
      if (hasAnotherAttempt && isReasoningRejectError(err)) {
        logger.warn({ err, model: params.model, attempt: i + 1 }, "[OpenRouter] Retrying without reasoning override");
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? new Error("[OpenRouter] createChatCompletion failed");
}

/** Lazy OpenAI client — server can start without OPENROUTER_API_KEY; AI routes fail at call time. */
export const openrouter: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

if (!process.env["OPENROUTER_API_KEY"]) {
  logger.warn(
    "[OpenRouter] OPENROUTER_API_KEY is not set — AI/chatbot features will be unavailable until configured",
  );
}

// Legacy alias kept for any external imports.
export const DEEPSEEK_MODEL = "deepseek/deepseek-chat-v3-0324";

// ─── Model selection ────────────────────────────────────────────────────────
// FAST_MODEL — used for structured JSON tasks (classification, datetime extraction,
//   script parsing). Must reliably honour `response_format: json_object`.
// CHAT_MODEL — used for free-form patient-facing replies. Quality > cost.
// Override via env if needed (e.g. to A/B test or fall back to DeepSeek).
export const FAST_MODEL =
  process.env["CHATBOT_FAST_MODEL"] ?? "google/gemini-2.5-flash";
export const CHAT_MODEL =
  process.env["CHATBOT_CHAT_MODEL"] ?? "google/gemini-2.5-flash";

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 20_000;

/** Wraps any promise in a hard timeout. Rejects with `OpenRouterTimeout` after N ms. */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  label = "openrouter",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`OpenRouterTimeout: ${label} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Strips markdown code fences (```json ... ``` or ``` ... ```) and any leading/trailing
 * commentary before/after the first JSON object or array. Safe to call on already-clean JSON.
 */
export function sanitizeJsonResponse(raw: string): string {
  if (!raw) return "{}";
  let s = raw.trim();

  // Remove ```json ... ``` or ``` ... ``` fences
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    s = fenceMatch[1].trim();
  }

  // Slice from first { or [ to its matching last } or ]
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  let start = -1;
  let endChar = "}";
  if (firstObj === -1 && firstArr === -1) return s;
  if (firstObj === -1) {
    start = firstArr;
    endChar = "]";
  } else if (firstArr === -1) {
    start = firstObj;
    endChar = "}";
  } else {
    start = Math.min(firstObj, firstArr);
    endChar = start === firstObj ? "}" : "]";
  }
  const end = s.lastIndexOf(endChar);
  if (end > start) {
    s = s.slice(start, end + 1);
  }
  return s;
}

/** Safely parses a JSON response from an LLM, stripping markdown wrappers. */
export function parseLlmJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const cleaned = sanitizeJsonResponse(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    logger.warn(
      { err, rawSnippet: raw.slice(0, 200) },
      "[OpenRouter] Failed to parse LLM JSON response",
    );
    return null;
  }
}
