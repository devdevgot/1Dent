import { parseLlmJson } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import type {
  ChatbotAgentTurn,
  ChatbotAgentAction,
  ChatbotAgentIntent,
} from "./chatbot-agent.types";

function normalizeAction(raw: unknown): ChatbotAgentAction | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = o["type"];
  if (typeof type !== "string") return null;
  return {
    type: type as ChatbotAgentAction["type"],
    excludeCurrentDoctor: o["excludeCurrentDoctor"] === true,
    branch: typeof o["branch"] === "string" ? o["branch"] : undefined,
    name: typeof o["name"] === "string" ? o["name"] : undefined,
    datetimeText: typeof o["datetimeText"] === "string" ? o["datetimeText"] : undefined,
  };
}

function normalizeIntent(raw: unknown): ChatbotAgentIntent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    serviceType: typeof o["serviceType"] === "string" ? o["serviceType"] : undefined,
    urgency:
      o["urgency"] === "urgent" || o["urgency"] === "soon" || o["urgency"] === "planned"
        ? o["urgency"]
        : undefined,
    selectedBranch:
      o["selectedBranch"] === null
        ? null
        : typeof o["selectedBranch"] === "string"
          ? o["selectedBranch"]
          : undefined,
    patientName:
      o["patientName"] === null
        ? null
        : typeof o["patientName"] === "string"
          ? o["patientName"]
          : undefined,
    preferredDatetime:
      o["preferredDatetime"] === null
        ? null
        : typeof o["preferredDatetime"] === "string"
          ? o["preferredDatetime"]
          : undefined,
    problemDescription:
      typeof o["problemDescription"] === "string" ? o["problemDescription"] : undefined,
  };
}

/** Parse LLM JSON into ChatbotAgentTurn. */
export function parseChatbotAgentTurn(raw: string | null): ChatbotAgentTurn | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = parseLlmJson<Record<string, unknown>>(raw);
    if (!parsed || typeof parsed !== "object") {
      return parseAgentReplyOnly(raw);
    }

    const reply = typeof parsed["reply"] === "string" ? parsed["reply"].trim() : "";
    if (!reply) return parseAgentReplyOnly(raw);

    const actionsRaw = parsed["actions"];
    const actions = Array.isArray(actionsRaw)
      ? actionsRaw.map(normalizeAction).filter((a): a is ChatbotAgentAction => a != null)
      : [];

    return {
      reply,
      mindMapNodeId:
        parsed["mindMapNodeId"] === null
          ? null
          : typeof parsed["mindMapNodeId"] === "string"
            ? parsed["mindMapNodeId"]
            : undefined,
      fsmHint: typeof parsed["fsmHint"] === "string" ? parsed["fsmHint"] : undefined,
      intent: normalizeIntent(parsed["intent"]),
      actions,
      handoff: parsed["handoff"] === true,
    };
  } catch (err) {
    logger.warn({ err, rawSnippet: raw.slice(0, 200) }, "[AgentTurn] Failed to parse agent JSON");
    return parseAgentReplyOnly(raw);
  }
}

/** Recover at least the reply field when full JSON is malformed. */
export function parseAgentReplyOnly(raw: string | null): ChatbotAgentTurn | null {
  if (!raw?.trim()) return null;

  const parsed = parseLlmJson<Record<string, unknown>>(raw);
  if (parsed && typeof parsed["reply"] === "string" && parsed["reply"].trim()) {
    return { reply: parsed["reply"].trim(), actions: [] };
  }

  const match = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (match?.[1]) {
    try {
      const reply = JSON.parse(`"${match[1]}"`) as string;
      if (reply.trim()) return { reply: reply.trim(), actions: [] };
    } catch {
      /* ignore */
    }
  }

  return null;
}
