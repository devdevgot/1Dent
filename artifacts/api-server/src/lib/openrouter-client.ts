import OpenAI from "openai";
import { logger } from "./logger";

const apiKey = process.env["OPENROUTER_API_KEY"];
const baseURL = "https://openrouter.ai/api/v1";

if (!apiKey) {
  logger.warn("[OpenRouter] OPENROUTER_API_KEY is not set — AI chatbot features will be disabled");
}

export const openrouter = apiKey
  ? new OpenAI({ apiKey, baseURL })
  : null;

export const DEEPSEEK_MODEL = "deepseek/deepseek-chat-v3-0324";

export function isOpenRouterAvailable(): boolean {
  return openrouter !== null;
}
