import OpenAI from "openai";
import { logger } from "./logger";

const apiKey = process.env["OPENROUTER_API_KEY"];
const baseURL = "https://openrouter.ai/api/v1";

if (!apiKey) {
  const msg = "[OpenRouter] OPENROUTER_API_KEY is required but not set. Add it to Replit Secrets.";
  logger.error(msg);
  throw new Error(msg);
}

export const openrouter = new OpenAI({ apiKey, baseURL });

// Legacy alias kept for any external imports.
export const DEEPSEEK_MODEL = "deepseek/deepseek-chat-v3-0324";

// ─── Model selection ────────────────────────────────────────────────────────
// FAST_MODEL — used for structured JSON tasks (classification, datetime extraction,
//   script parsing). Must reliably honour `response_format: json_object`.
// CHAT_MODEL — used for free-form patient-facing replies. Quality > cost.
// Override via env if needed (e.g. to A/B test or fall back to DeepSeek).
export const FAST_MODEL =
  process.env["CHATBOT_FAST_MODEL"] ?? "openai/gpt-4o-mini";
export const CHAT_MODEL =
  process.env["CHATBOT_CHAT_MODEL"] ?? "anthropic/claude-3.5-haiku";

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
