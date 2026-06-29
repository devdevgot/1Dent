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
    "https://1dent.kz"
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

/** Gemini / thinking models can spend the whole max_tokens budget on reasoning and return empty content. */
function shouldDisableReasoning(model: string): boolean {
  const id = model.toLowerCase();
  return id.includes("gemini") || id.includes("/o1") || id.includes("/o3") || id.includes("thinking");
}

type OpenRouterChatParams = ChatCompletionCreateParamsNonStreaming & {
  reasoning?: { effort?: string; max_tokens?: number; exclude?: boolean; enabled?: boolean };
};

export async function createChatCompletion(
  params: ChatCompletionCreateParamsNonStreaming,
  opts?: { timeoutMs?: number; label?: string; disableReasoning?: boolean },
): Promise<OpenAI.Chat.ChatCompletion> {
  const client = getClient();
  const disableReasoning = opts?.disableReasoning ?? shouldDisableReasoning(params.model);
  const body: OpenRouterChatParams = {
    ...params,
    ...(disableReasoning ? { reasoning: { effort: "none" } } : {}),
  };

  const promise = client.chat.completions.create(body as ChatCompletionCreateParamsNonStreaming);
  return withTimeout(
    promise,
    opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    opts?.label ?? "openrouter",
  );
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
