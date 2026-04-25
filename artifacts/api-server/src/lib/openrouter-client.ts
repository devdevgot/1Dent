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

export const DEEPSEEK_MODEL = "deepseek/deepseek-chat-v3-0324";

export function isOpenRouterAvailable(): boolean {
  return true;
}
